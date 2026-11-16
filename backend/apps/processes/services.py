"""Business rules for processes and versions. Views stay thin; all writes go through here."""

from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.core import audit
from apps.core.exceptions import DomainError

from . import bpmn
from .models import Activity, Lane, ProcessNode, ProcessVersion


# ---------------------------------------------------------------- versions
def current_version(process: ProcessNode, kind: str = ProcessVersion.Kind.TO_BE) -> ProcessVersion | None:
    return process.versions.filter(kind=kind, status=ProcessVersion.Status.APPROVED).order_by("-approved_at").first()


def _next_version(process: ProcessNode, kind: str, base: str) -> str:
    major, _, minor = base.partition(".")
    taken = set(process.versions.filter(kind=kind).values_list("version", flat=True))
    n = int(minor or 0) + 1
    while f"{major}.{n}" in taken:
        n += 1
    return f"{major}.{n}"


@transaction.atomic
def new_draft(source: ProcessVersion, user, note: str = "") -> ProcessVersion:
    if source.process.versions.filter(kind=source.kind, status__in=[ProcessVersion.Status.DRAFT, ProcessVersion.Status.IN_REVIEW]).exists():
        raise DomainError(
            f"{source.process.code} already has an open {source.kind} draft. Finish or discard it first.", code="draft_exists"
        )
    draft = ProcessVersion.objects.create(
        process=source.process,
        kind=source.kind,
        version=_next_version(source.process, source.kind, source.version),
        status=ProcessVersion.Status.DRAFT,
        note=note or f"Created from v{source.version}",
        bpmn_xml=source.bpmn_xml,
        based_on=source,
        created_by=user,
        updated_by=user,
    )
    audit.record(
        user,
        "create",
        "process_version",
        draft.pk,
        f"Created {draft.kind} v{draft.version} draft from v{source.version}",
        process_code=draft.process.code,
    )
    return draft


def save_model(version: ProcessVersion, xml: str, user) -> ProcessVersion:
    if version.status != ProcessVersion.Status.DRAFT:
        raise DomainError("Only a Draft version can be edited. Create a new draft first.", code="not_draft")
    bpmn.parse(xml)  # validates; raises BpmnError
    version.bpmn_xml = xml
    version.updated_by = user
    version.save(update_fields=["bpmn_xml", "updated_by", "updated_at"])
    audit.record(
        user,
        "update",
        "process_version",
        version.pk,
        f"Saved BPMN model of {version.kind} v{version.version}",
        process_code=version.process.code,
    )
    return version


@transaction.atomic
def apply_approval(version: ProcessVersion, approver) -> ProcessVersion:
    """Called by governance once a checker approves. Retires the previous approved version of the same kind."""
    previous = version.process.versions.filter(kind=version.kind, status=ProcessVersion.Status.APPROVED).exclude(pk=version.pk)
    previous.update(status=ProcessVersion.Status.RETIRED)
    version.status = ProcessVersion.Status.APPROVED
    version.approved_by = str(approver)
    version.approved_at = timezone.now()
    version.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    if version.kind == ProcessVersion.Kind.TO_BE:
        sync_activities(version)
    return version


# ---------------------------------------------------------------- activities & lanes
@transaction.atomic
def sync_activities(version: ProcessVersion) -> dict:
    """Make L4 activities match the model: add new tasks, refresh names/lanes/types, keep enrichment."""
    model = bpmn.parse(version.bpmn_xml)
    process = version.process
    existing = {a.task_id: a for a in process.activities.all()}
    seen, added = set(), 0
    for task in model.tasks:
        seen.add(task.task_id)
        activity = existing.get(task.task_id) or Activity(process=process, task_id=task.task_id)
        added += activity.pk is None
        activity.name = task.name[:250]
        activity.bpmn_type = task.bpmn_type
        activity.lane = task.lane[:150]
        activity.parent_task = task.parent_task
        activity.parent_name = task.parent_name[:250]
        activity.order = task.order
        activity.in_current_model = True
        activity.save()
    removed = process.activities.exclude(task_id__in=seen).update(in_current_model=False)
    for i, name in enumerate(model.lanes):
        Lane.objects.get_or_create(
            process=process, name=name, defaults={"order": i, "is_external": name.lower() in {"supplier", "customer", "vendor"}}
        )
    return {"activities": len(model.tasks), "added": added, "not_in_model": removed, "lanes": len(model.lanes)}


# ---------------------------------------------------------------- controls
def sod_conflicts(process: ProcessNode) -> list[dict]:
    lanes = {lane.name: lane for lane in process.lanes.select_related("sub_job_family")}
    acts = {a.task_id: a for a in process.activities.filter(in_current_model=True)}
    out = []
    for rule in settings.XCORE["SOD_RULES"]:
        a, b = acts.get(rule["a"]), acts.get(rule["b"])
        if not (a and b):
            continue
        la, lb = lanes.get(a.lane), lanes.get(b.lane)
        sa = la.sub_job_family_id if la else None
        sb = lb.sub_job_family_id if lb else None
        out.append(
            {
                "rule": f"{rule['a']} ⟂ {rule['b']}",
                "why": rule["why"],
                "a": {"task_id": a.task_id, "name": a.name, "lane": a.lane, "sub_job_family": sa},
                "b": {"task_id": b.task_id, "name": b.name, "lane": b.lane, "sub_job_family": sb},
                "conflict": bool(sa and sa == sb),
            }
        )
    return out


def raci(process: ProcessNode) -> dict:
    """R = the lane (sub job family) performing the activity; A = the accountable process-owner job."""
    lanes = {lane.name: lane for lane in process.lanes.select_related("sub_job_family")}
    rows = []
    for a in process.activities.filter(in_current_model=True):
        lane = lanes.get(a.lane)
        rows.append(
            {
                "task_id": a.task_id,
                "name": a.name,
                "responsible": a.lane,
                "responsible_sjf": lane.sub_job_family_id
                if lane and lane.sub_job_family_id
                else ("external" if lane and lane.is_external else ""),
                "accountable": process.owner,
                "accountable_job": process.owner_job_id or "",
            }
        )
    return {"owner": process.owner, "owner_job": process.owner_job_id, "rows": rows}


def quality_checklist(process: ProcessNode) -> list[dict]:
    """Release-readiness checks shown on the Quality tab."""
    from apps.kpis.models import Kpi, KpiTarget  # local import: kpis depends on processes

    acts = list(process.activities.filter(in_current_model=True))
    lanes = list(process.lanes.all())
    kpis = list(Kpi.objects.filter(node=process))
    risks = list(process.risks.all())
    tobe = current_version(process)
    conflicts = [c for c in sod_conflicts(process) if c["conflict"]]
    unmapped = [lane.name for lane in lanes if not lane.is_external and not lane.sub_job_family_id]
    no_system = [a.task_id for a in acts if a.automation != Activity.Automation.MANUAL and not a.system]
    no_target = [k.kpi_id for k in kpis if not KpiTarget.objects.filter(kpi=k, status=KpiTarget.Status.ACTIVE).exists()]
    measured_bad = [k.kpi_id for k in kpis if k.calc_type == "Measured" and not k.from_task]
    no_control = [r.risk_id for r in risks if not r.control]

    def check(cid, label, ok, detail=""):
        return {"id": cid, "label": label, "ok": bool(ok), "detail": detail}

    return [
        check(
            "owner",
            "Accountable owner and owner job are set",
            process.owner and process.owner_job_id,
            process.owner_job_id or "Owner job missing",
        ),
        check("tobe", "An approved To-Be model exists", tobe, f"To-Be v{tobe.version}" if tobe else "No approved To-Be"),
        check("lanes", "Every lane is a sub job family or an external party", not unmapped, ", ".join(unmapped)),
        check("lane_use", "Every activity sits in a lane", all(a.lane for a in acts), ""),
        check("systems", "Non-manual activities name their system", not no_system, ", ".join(no_system)),
        check("kpi", "At least one process KPI is defined", kpis, f"{len(kpis)} KPI(s)"),
        check("measure", "Measured KPIs name the activity they are measured on", not measured_bad, ", ".join(measured_bad)),
        check("targets", "Every KPI has an active target", not no_target, ", ".join(no_target)),
        check("risks", "Every risk has a control", not no_control, ", ".join(no_control)),
        check("sod", "No segregation-of-duties conflict", not conflicts, ", ".join(c["rule"] for c in conflicts)),
    ]
