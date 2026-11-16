"""
Service generator — proposes catalog entries from a governed To-Be model.

The default backend is deterministic and rule-based (pattern library + fuzzy matching), so it runs
offline and its output is reproducible. An LLM backend can be plugged in through
settings.XCORE["SERVICE_GENERATOR"] as long as it returns the same schema-validated Candidate records.

Six rules: evidence-based · reuse before creation · no invented commitments · traceability ·
human approval · schema-validated output.
"""

from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.utils.module_loading import import_string

PATTERNS_FILE = Path(__file__).parent / "data" / "service_patterns.json"
MATCH_THRESHOLD = 0.45


@lru_cache(maxsize=1)
def library() -> dict:
    return json.loads(PATTERNS_FILE.read_text(encoding="utf-8"))


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).strip()


def similarity(a: str, b: str) -> float:
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0.0
    ratio = SequenceMatcher(None, a, b).ratio()
    ta, tb = set(a.split()), set(b.split())
    overlap = len(ta & tb) / max(1, min(len(ta), len(tb)))
    return round(max(ratio, overlap * 0.9), 3)


@dataclass
class Candidate:
    key: str
    name: str
    category: str
    verdict: str  # service | activity | enhance
    confidence: int
    description: str = ""
    reason: str = ""
    recipient: str = ""
    trigger: str = ""
    inputs: str = ""
    output: str = ""
    owner: str = ""
    sla: str | None = None
    system: str = ""
    automation: str = ""
    source_activity: str = ""
    evidence: list[dict] = field(default_factory=list)
    kpis: list[dict] = field(default_factory=list)
    existing_service: str | None = None
    flags: list[str] = field(default_factory=list)
    source_version: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class RuleBasedGenerator:
    def generate(self, process, version) -> list[Candidate]:
        from apps.kpis.models import Kpi

        activities = list(process.activities.filter(in_current_model=True))
        services = list(process.services.exclude(status="Retired"))
        kpis = list(Kpi.objects.filter(node__code__in=[process.code, process.parent.code if process.parent else ""]))
        out: list[Candidate] = []
        for i, p in enumerate(x for x in library()["patterns"] if x["process"] == process.code):
            cand = Candidate(
                key=f"{process.code}-C{i + 1:02d}",
                name=p["name"],
                category=p["category"],
                verdict=p["verdict"],
                confidence=int(p["confidence"]),
                description=p.get("description", ""),
                reason=p.get("reason", ""),
                recipient=p.get("recipient", ""),
                trigger=p.get("trigger", ""),
                inputs=p.get("inputs", ""),
                output=p.get("output", ""),
                system=p.get("system", ""),
                automation=p.get("automation", ""),
                source_activity=p["source_activity"],
                source_version=f"{version.kind} v{version.version}" if version else "",
            )
            # Rule 1 — evidence: link to the To-Be activities that deliver it
            scored = sorted(((similarity(p["source_activity"], a.name), a) for a in activities), key=lambda x: -x[0])
            cand.evidence = [
                {"task_id": a.task_id, "name": a.name, "lane": a.lane, "match": s} for s, a in scored[:3] if s >= MATCH_THRESHOLD
            ]
            if not cand.evidence:
                cand.flags.append("No matching To-Be activity — confirm the source step with the process owner.")
                cand.confidence = max(0, cand.confidence - 20)
            # Rule 2 — reuse before creation
            best = max(((similarity(p["name"], s.name), s) for s in services), default=(0, None), key=lambda x: x[0])
            if best[1] is not None and best[0] >= 0.75:
                cand.existing_service = best[1].service_id
                if cand.verdict == "service":
                    cand.verdict = "enhance"
                    cand.reason = f"Already in the catalog as {best[1].service_id}; update it instead of duplicating."
            # Rule 3 — no invented commitments
            cand.owner = p.get("owner", "") if p.get("owner_confirmed") else ""
            if cand.verdict == "service":
                if not cand.owner:
                    cand.flags.append(p.get("owner_note") or "Service owner not confirmed.")
                if not p.get("sla"):
                    cand.flags.append("SLA not defined — the service owner must commit to one.")
            cand.sla = p.get("sla")
            # KPIs: proposed measures matched against the library
            for k in p.get("kpis", []):
                match = max(((similarity(k["l"], x.name), x) for x in kpis), default=(0, None), key=lambda x: x[0])
                cand.kpis.append(
                    {
                        "label": k["l"],
                        "kpi_id": match[1].kpi_id if match[1] is not None and match[0] >= 0.5 else None,
                        "key": bool(k.get("k")),
                    }
                )
            out.append(cand)
        return out


def get_generator():
    path = settings.XCORE.get("SERVICE_GENERATOR")
    return import_string(path)() if path else RuleBasedGenerator()
