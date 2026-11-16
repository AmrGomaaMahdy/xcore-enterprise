"""
Impact analysis ("where used"): before changing an activity, process, KPI, sub job family or system,
show everything that depends on it.
"""

from __future__ import annotations

from django.db.models import Q

from apps.catalog.models import Service
from apps.core.exceptions import DomainError
from apps.hcm.models import Employee, SubJobFamily
from apps.kpis.models import Kpi, KpiLink, KpiTarget
from apps.processes.models import Activity, Lane, ProcessDocument, ProcessNode, Risk

TYPES = ("activity", "process", "kpi", "sub_job_family", "system")


def _kpi(k):
    return {"kpi_id": k.kpi_id, "name": k.name, "tier": k.tier, "node": k.node.code}


def _svc(s):
    return {"service_id": s.service_id, "name": s.name, "status": s.status, "process": s.process.code}


def _upstream(kpi_ids: set[str]) -> list[str]:
    """All KPIs above the given ones (through roll-ups and explained-by)."""
    seen, frontier = set(), set(kpi_ids)
    while frontier:
        parents = set(KpiLink.objects.filter(child__kpi_id__in=frontier).values_list("parent__kpi_id", flat=True)) - seen - kpi_ids
        seen |= parents
        frontier = parents
    return sorted(seen)


def analyse(kind: str, ref: str) -> dict:
    if kind not in TYPES:
        raise DomainError(f"type must be one of {', '.join(TYPES)}", code="bad_type")
    result: dict = {"type": kind, "ref": ref, "sections": []}

    def section(title, items, severity="info"):
        result["sections"].append({"title": title, "count": len(items), "severity": severity, "items": items})

    if kind == "activity":
        acts = list(Activity.objects.filter(task_id=ref).select_related("process"))
        if not acts:
            raise DomainError("Unknown activity.", code="not_found")
        a = acts[0]
        result["label"] = f"{a.task_id} · {a.name}"
        kpis = list(Kpi.objects.filter(Q(from_task=ref) | Q(to_task=ref)).select_related("node"))
        section("KPIs measured on this activity", [_kpi(k) for k in kpis], "high" if kpis else "info")
        section(
            "KPIs that roll up from them",
            [_kpi(k) for k in Kpi.objects.filter(kpi_id__in=_upstream({k.kpi_id for k in kpis})).select_related("node")],
        )
        section(
            "Catalog services delivered by it",
            [_svc(s) for s in Service.objects.select_related("process") if ref in (s.task_ids or [])],
            "high",
        )
        section(
            "Risks & controls on this step",
            [{"risk_id": r.risk_id, "title": r.title, "control": r.control} for r in Risk.objects.filter(step=ref)],
            "medium",
        )
        section(
            "Documents attached to this step", [{"doc_id": d.doc_id, "title": d.title} for d in ProcessDocument.objects.filter(step=ref)]
        )
        lane = Lane.objects.filter(process=a.process, name=a.lane).select_related("sub_job_family").first()
        section(
            "Performed by (lane → sub job family)",
            [
                {
                    "lane": a.lane,
                    "sub_job_family": lane.sub_job_family_id if lane else None,
                    "employees": Employee.objects.filter(sub_job_family=lane.sub_job_family).count()
                    if lane and lane.sub_job_family_id
                    else 0,
                }
            ],
        )
    elif kind == "process":
        p = ProcessNode.objects.filter(code=ref).first()
        if not p:
            raise DomainError("Unknown process.", code="not_found")
        result["label"] = f"{p.code} · {p.name}"
        codes = [p.code] + list(
            ProcessNode.objects.filter(Q(parent=p) | Q(parent__parent=p) | Q(parent__parent__parent=p)).values_list("code", flat=True)
        )
        section("Child nodes", [{"code": c} for c in codes[1:]])
        section(
            "Activities (L4)",
            [
                {"task_id": a.task_id, "name": a.name, "automation": a.automation}
                for a in Activity.objects.filter(process__code__in=codes, in_current_model=True)
            ],
        )
        kpis = list(Kpi.objects.filter(node__code__in=codes).select_related("node"))
        section("KPIs owned here", [_kpi(k) for k in kpis], "high")
        section(
            "Higher-tier KPIs depending on them",
            [
                _kpi(k)
                for k in Kpi.objects.filter(kpi_id__in=_upstream({k.kpi_id for k in kpis}))
                .exclude(node__code__in=codes)
                .select_related("node")
            ],
            "high",
        )
        section("Catalog services", [_svc(s) for s in Service.objects.filter(process__code__in=codes).select_related("process")], "medium")
        section(
            "Lanes → sub job families",
            [{"lane": lk.name, "sub_job_family": lk.sub_job_family_id} for lk in Lane.objects.filter(process__code__in=codes)],
        )
    elif kind == "kpi":
        k = Kpi.objects.filter(kpi_id=ref).select_related("node", "objective").first()
        if not k:
            raise DomainError("Unknown KPI.", code="not_found")
        result["label"] = f"{k.kpi_id} · {k.name}"
        ups = _upstream({k.kpi_id})
        section("KPIs it feeds (all tiers above)", [_kpi(x) for x in Kpi.objects.filter(kpi_id__in=ups).select_related("node")], "high")
        objs = sorted({x.objective_id for x in Kpi.objects.filter(kpi_id__in=ups + [k.kpi_id]) if x.objective_id})
        section("Strategic objectives affected", [{"code": o} for o in objs], "high")
        section("Targets", [{"target_id": t.target_id, "period": t.period, "status": t.status} for t in KpiTarget.objects.filter(kpi=k)])
        section("Catalog services measured by it", [_svc(s) for s in k.services.select_related("process")], "medium")
        section("Measured on activities", [{"from": k.from_task, "to": k.to_task}] if k.from_task else [])
    elif kind == "sub_job_family":
        sjf = SubJobFamily.objects.filter(code=ref).select_related("job_family").first()
        if not sjf:
            raise DomainError("Unknown sub job family.", code="not_found")
        result["label"] = f"{sjf.code} · {sjf.name} ({sjf.job_family.name})"
        lanes = list(Lane.objects.filter(sub_job_family=sjf).select_related("process"))
        section("Lanes in process models", [{"process": lk.process.code, "lane": lk.name} for lk in lanes], "high")
        acts = [a for lk in lanes for a in Activity.objects.filter(process=lk.process, lane=lk.name, in_current_model=True)]
        section("Activities performed", [{"task_id": a.task_id, "name": a.name, "process": a.process.code} for a in acts])
        task_ids = {a.task_id for a in acts}
        kpis = list(Kpi.objects.filter(Q(from_task__in=task_ids) | Q(to_task__in=task_ids)).select_related("node"))
        section("KPIs cascaded to this sub job family", [_kpi(k) for k in kpis], "medium")
        section("Employees (IDs only)", [{"employee_id": e.employee_id} for e in Employee.objects.filter(sub_job_family=sjf)])
    else:  # system
        acts = list(Activity.objects.filter(system__icontains=ref, in_current_model=True).select_related("process"))
        result["label"] = f"System · {ref}"
        section(
            "Activities running on it",
            [{"task_id": a.task_id, "name": a.name, "process": a.process.code, "automation": a.automation} for a in acts],
            "high",
        )
        task_ids = {a.task_id for a in acts}
        section(
            "KPIs measured from it",
            [
                _kpi(k)
                for k in Kpi.objects.filter(Q(source__icontains=ref) | Q(from_task__in=task_ids) | Q(to_task__in=task_ids)).select_related(
                    "node"
                )
            ],
            "medium",
        )
        section("Services using it as channel", [_svc(s) for s in Service.objects.filter(channel__icontains=ref).select_related("process")])
    result["total"] = sum(s["count"] for s in result["sections"])
    return result


def options() -> dict:
    return {
        "activity": list(Activity.objects.filter(in_current_model=True).values("task_id", "name", "process__code")),
        "process": list(ProcessNode.objects.values("code", "name", "level")),
        "kpi": list(Kpi.objects.values("kpi_id", "name")),
        "sub_job_family": list(SubJobFamily.objects.values("code", "name")),
        "system": sorted(
            {s.strip() for v in Activity.objects.exclude(system="").values_list("system", flat=True) for s in v.split(",") if s.strip()}
        ),
    }
