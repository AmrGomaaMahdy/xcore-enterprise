"""
KPI calculation & alignment engine (pure functions over an in-memory snapshot, so one request = 3 queries).

Scoring  higher is better → actual ÷ target · lower is better → target ÷ actual · capped at 100.
Derived  weighted average of contributor scores (weights add up to 100).
Gate     worst contributor score.
Measured / Direct  scored from its own actual.
Contribution of a KPI to an objective = product of roll-up weights along the path.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

from .models import TIER_NAMES, Kpi, KpiLink, KpiTarget, StrategicObjective

HEALTH = {"on_target": 100, "watch": 62, "below": 28}


def score(actual, target, direction: str) -> float | None:
    if actual is None or target in (None, 0):
        return None
    actual, target = float(actual), float(target)
    if direction == Kpi.Direction.LOWER:
        raw = 100.0 if actual <= 0 else target / actual * 100
    else:
        raw = actual / target * 100
    return round(max(0.0, min(100.0, raw)), 1)


def health(actual, green, amber, direction: str) -> str | None:
    if actual is None or green is None:
        return None
    a, g, m = float(actual), float(green), float(amber if amber is not None else green)
    if direction == Kpi.Direction.LOWER:
        return "on_target" if a <= g else "watch" if a <= m else "below"
    return "on_target" if a >= g else "watch" if a >= m else "below"


@dataclass
class Snapshot:
    kpis: dict[str, Kpi]
    rolls: dict[str, list[tuple[str, float]]] = field(default_factory=lambda: defaultdict(list))
    explains: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    parents: dict[str, list[str]] = field(default_factory=lambda: defaultdict(list))
    targets: dict[str, KpiTarget] = field(default_factory=dict)

    @classmethod
    def load(cls) -> Snapshot:
        kpis = {k.kpi_id: k for k in Kpi.objects.select_related("node", "objective")}
        snap = cls(kpis=kpis)
        for link in KpiLink.objects.select_related("parent", "child"):
            p, c = link.parent.kpi_id, link.child.kpi_id
            if link.relation == KpiLink.Relation.ROLLS_UP:
                snap.rolls[p].append((c, float(link.weight or 0)))
                snap.parents[c].append(p)
            else:
                snap.explains[p].append(c)
        for t in KpiTarget.objects.filter(status=KpiTarget.Status.ACTIVE, scope="Company").select_related("kpi").order_by("period"):
            snap.targets[t.kpi.kpi_id] = t  # latest period wins
        return snap

    # ---------------------------------------------------------------- calculation
    def kpi_score(self, kpi_id: str, _seen: frozenset = frozenset()) -> float | None:
        if kpi_id in _seen:  # cycle guard
            return None
        kpi = self.kpis[kpi_id]
        if kpi.calc_type in (Kpi.CalcType.DERIVED, Kpi.CalcType.GATE) and self.rolls.get(kpi_id):
            parts = [(self.kpi_score(c, _seen | {kpi_id}), w) for c, w in self.rolls[kpi_id]]
            parts = [(s, w) for s, w in parts if s is not None]
            if not parts:
                return None
            if kpi.calc_type == Kpi.CalcType.GATE:
                return min(s for s, _ in parts)
            total = sum(w for _, w in parts) or 1
            return round(sum(s * w for s, w in parts) / total, 1)
        target = self.targets.get(kpi_id)
        return score(kpi.actual, target.green if target else None, kpi.direction)

    def rule_text(self, kpi_id: str) -> str:
        kpi = self.kpis[kpi_id]
        if kpi.calc_type == Kpi.CalcType.DERIVED:
            return "Weighted average of " + " + ".join(f"{c} × {w:g}%" for c, w in self.rolls.get(kpi_id, []))
        if kpi.calc_type == Kpi.CalcType.GATE:
            return "Worst of " + ", ".join(c for c, _ in self.rolls.get(kpi_id, []))
        if kpi.calc_type == Kpi.CalcType.MEASURED:
            if kpi.level < 3:
                return "Measured directly"
            return f"Measured between {kpi.from_task} → {kpi.to_task}" if kpi.to_task else f"Measured on {kpi.from_task or '?'}"
        drivers = self.explains.get(kpi_id, [])
        return "Measured at its own level" + (f"; explained by {', '.join(drivers)}" if drivers else "")

    # ---------------------------------------------------------------- alignment matrix
    def descend(self, kpi_id: str, weight: float = 1.0, path: tuple = ()) -> list[tuple[tuple, float, bool]]:
        """All paths from kpi_id downwards: (path, contribution, via_driver)."""
        path = path + (kpi_id,)
        out = [(path, weight, False)]
        for child, w in self.rolls.get(kpi_id, []):
            if child not in path:
                out += self.descend(child, weight * w / 100, path)
        for child in self.explains.get(kpi_id, []):
            if child not in path:
                out += [(p, c, True) for p, c, _ in self.descend(child, weight, path)]
        return out

    def alignment(self) -> dict:
        objectives = list(StrategicObjective.objects.all())
        rows, chains = [], []
        for obj in objectives:
            roots = [k for k in self.kpis.values() if k.objective_id == obj.code]
            contrib: dict[str, dict] = {}
            for root in roots:
                for path, weight, driver in self.descend(root.kpi_id):
                    leaf = path[-1]
                    slot = contrib.setdefault(leaf, {"kpi_id": leaf, "contribution": 0.0, "driver": False, "paths": 0})
                    if driver:
                        slot["driver"] = True
                    else:
                        slot["contribution"] += weight * 100
                    slot["paths"] += 1
                    if self.kpis[leaf].level >= 3 and not self.rolls.get(leaf) and not self.explains.get(leaf):
                        chains.append({"objective": obj.code, "path": list(path), "contribution": round(weight * 100, 1), "driver": driver})
            for leaf, slot in contrib.items():
                k = self.kpis[leaf]
                rows.append(
                    {
                        "objective": obj.code,
                        "kpi_id": leaf,
                        "name": k.name,
                        "level": k.level,
                        "tier": k.tier,
                        "node": k.node.code,
                        "contribution": round(slot["contribution"], 1),
                        "driver": slot["driver"] and slot["contribution"] == 0,
                    }
                )
        return {
            "objectives": [
                {
                    "code": o.code,
                    "name": o.name,
                    "description": o.description,
                    "is_outcome": o.is_outcome,
                    "kpis": [k.kpi_id for k in self.kpis.values() if k.objective_id == o.code],
                    "score": self._objective_score(o.code),
                }
                for o in objectives
            ],
            "rows": rows,
            "chains": chains,
        }

    def _objective_score(self, code: str) -> float | None:
        scores = [self.kpi_score(k.kpi_id) for k in self.kpis.values() if k.objective_id == code]
        scores = [s for s in scores if s is not None]
        return round(sum(scores) / len(scores), 1) if scores else None

    # ---------------------------------------------------------------- cascade network
    def cascade(self) -> dict:
        """Nodes/edges for the KPI hierarchy & cascade view. The enterprise outcome is kept off the network."""
        nodes, edges = [], []
        visible = {k for k, v in self.kpis.items() if not v.is_outcome}
        for kid in sorted(visible, key=lambda x: (self.kpis[x].level, x)):
            k = self.kpis[kid]
            nodes.append(
                {
                    "id": kid,
                    "name": k.name,
                    "level": k.level,
                    "tier": k.tier,
                    "node": k.node.code,
                    "domain": k.node.domain_code(),
                    "calc_type": k.calc_type,
                    "objective": k.objective_id,
                    "unit": k.unit,
                    "direction": k.direction,
                    "rule": self.rule_text(kid),
                }
            )
            for child, w in self.rolls.get(kid, []):
                if child in visible:
                    edges.append({"source": kid, "target": child, "relation": "rolls_up", "weight": w})
            for child in self.explains.get(kid, []):
                if child in visible:
                    edges.append({"source": kid, "target": child, "relation": "explains", "weight": None})
        return {"nodes": nodes, "edges": edges, "tiers": TIER_NAMES}


def validate_weights(calc_type: str, weights: dict[str, Decimal | float]) -> None:
    from apps.core.exceptions import DomainError

    if calc_type == Kpi.CalcType.DERIVED:
        total = sum(float(w) for w in weights.values())
        if round(total, 2) != 100:
            raise DomainError(f"Weights of a derived KPI must add up to 100 (now {total:g}).", code="weights_total")
    if any(float(w) < 0 for w in weights.values()):
        raise DomainError("Weights cannot be negative.", code="weights_negative")
