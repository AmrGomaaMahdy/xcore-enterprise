"""
Load the X-Core demo library (same content as the HTML prototype).

    python manage.py load_demo_data            # only if the library is empty
    python manage.py load_demo_data --reset    # wipe library data first

Demo sign-ins are created only when XCORE_DEMO_PASSWORD is set (never a hard-coded password).
"""

import json
import os
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.dateparse import parse_datetime

from apps.catalog.models import Service
from apps.core.models import AuditEntry
from apps.governance import services as gov
from apps.governance.models import ApprovalRequest
from apps.hcm.models import BusinessUnit, Employee, Job, JobFamily, SubJobFamily
from apps.kpis.models import Kpi, KpiLink, KpiTarget, StrategicObjective
from apps.processes import services as process_services
from apps.processes.models import Lane, ProcessDocument, ProcessNode, ProcessVersion, Risk

FIXTURES = Path(settings.BASE_DIR) / "fixtures" / "demo"

OBJECTIVES = [
    ("OBJ-01", "Improve Construction Efficiency", "Deliver the physical build faster and at lower cost per unit of work."),
    ("OBJ-02", "Develop Project Management Capabilities", "Plan, control and deliver projects predictably."),
    ("OBJ-03", "Focus Support Functions on the Core Business", "Support functions serve construction first, at the right cost."),
    ("OBJ-04", "Build an Agile and Scalable Operating Model", "Standard, automated processes that scale with the portfolio."),
    ("OBJ-05", "Sustainable Economic Results", "Outcome of objectives 1–4: margin, cash and growth."),
]
DEMO_USERS = [
    ("xcore.admin", "admin", "Platform administrator"),
    ("process.editor", "editor", "Process excellence analyst"),
    ("process.approver", "approver", "Process owner (approver)"),
    ("xcore.viewer", "viewer", "Read-only viewer"),
]


def _dec(value):
    if value in (None, ""):
        return None
    return Decimal(str(value))


class Command(BaseCommand):
    help = "Load the X-Core Process Hub demo library."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete existing library data first")

    def handle(self, *args, reset=False, **opts):
        if ProcessNode.objects.exists() and not reset:
            self.stdout.write("Library already loaded — skipping (use --reset to reload).")
            return
        library = json.loads((FIXTURES / "library.json").read_text(encoding="utf-8"))
        hcm = json.loads((FIXTURES / "hcm.json").read_text(encoding="utf-8"))
        docs: dict[str, list[dict]] = {}
        for row in library:
            docs.setdefault(row["path"].split("/", 1)[0], []).append(row["data"])
        with transaction.atomic():
            if reset:
                self._wipe()
            users = self._users()
            self._hcm(hcm)
            self._nodes(docs["nodes"])
            self._versions(docs.get("versions", []))
            self._activities(docs["nodes"], docs.get("activities", []))
            self._kpis(docs.get("kpis", []))
            self._targets(docs.get("targets", []))
            self._services(docs.get("services", []))
            self._history(docs.get("audit", []))
            self._pending(users)
        self.stdout.write(
            self.style.SUCCESS(
                f"Loaded {ProcessNode.objects.count()} nodes, {ProcessVersion.objects.count()} versions, "
                f"{Kpi.objects.count()} KPIs, {KpiTarget.objects.count()} targets, {Service.objects.count()} services, "
                f"{ApprovalRequest.objects.filter(status='pending').count()} pending approvals."
            )
        )

    # ------------------------------------------------------------------
    def _wipe(self):
        for model in (ApprovalRequest, Service, KpiTarget, KpiLink, Kpi, StrategicObjective, Risk, ProcessDocument, Lane):
            model.objects.all().delete()
        for v in ProcessVersion.objects.all():
            v.delete()
        for level in (3, 2, 1, 0):
            ProcessNode.objects.filter(level=level).delete()
        for model in (Employee, Job, SubJobFamily, JobFamily, BusinessUnit):
            model.objects.all().delete()
        AuditEntry.objects.all().delete()

    def _users(self) -> dict:
        password = os.environ.get("XCORE_DEMO_PASSWORD", "")
        users = {}
        if not password:
            self.stdout.write("XCORE_DEMO_PASSWORD not set — no demo sign-ins created (use createsuperuser).")
            return users
        try:
            validate_password(password)
        except Exception as exc:  # noqa: BLE001
            raise CommandError(f"XCORE_DEMO_PASSWORD is too weak: {'; '.join(getattr(exc, 'messages', [str(exc)]))}") from exc
        User = get_user_model()
        for username, role, label in DEMO_USERS:
            user, _ = User.objects.get_or_create(username=username, defaults={"role": role, "display_name": label})
            user.role, user.display_name = role, label
            user.is_staff = user.is_superuser = role == "admin"
            user.set_password(password)
            user.save()
            users[role] = user
        self.stdout.write(f"Demo sign-ins: {', '.join(u for u, _, _ in DEMO_USERS)}")
        return users

    def _hcm(self, hcm):
        for bu in hcm["BU"]:
            BusinessUnit.objects.create(code=bu["code"], name=bu["name"])
        for f in hcm["families"]:
            JobFamily.objects.create(code=f["code"], name=f["name"])
        for s in hcm["subFamilies"]:
            SubJobFamily.objects.create(code=s["code"], name=s["name"], job_family_id=s["family"])
        for j in hcm["jobs"]:
            Job.objects.create(code=j["code"], title=j["title"], grade=j.get("grade"), sub_job_family_id=j["sjf"])
        positions = {p["id"]: p for p in hcm["positions"]}
        for e in hcm["employees"]:
            pos = positions.get(e.get("position"), {})
            Employee.objects.create(
                employee_id=e["id"],
                sub_job_family_id=e["sjf"],
                business_unit_id=pos.get("bu"),
                job_id=pos.get("job"),
                since=date.fromisoformat(e["since"]) if e.get("since") else None,
            )

    def _nodes(self, nodes):
        by_code = {}
        for n in sorted(nodes, key=lambda x: (x["level"], x.get("order", 0))):
            node = ProcessNode.objects.create(
                code=n["code"],
                level=n["level"],
                parent=by_code.get(n.get("parentId")),
                name=n["name"],
                description=n.get("description", ""),
                owner=n.get("owner", ""),
                status=n.get("status", "Active"),
                order=n.get("order", 0),
                owner_job_id=n.get("ownerJob") or None,
                process_type=n.get("processType", ""),
                business_units=n.get("bus", []),
                systems=n.get("systems", ""),
                criticality=n.get("criticality", ""),
                job_family=n.get("jobFamily", ""),
                sub_job_family=n.get("subJobFamily", ""),
                start_trigger=n.get("startTrigger", ""),
                applicable_domains=n.get("applicableDomains", ""),
                modelling_standard=n.get("modellingStandard", "BPMN 2.0") or "BPMN 2.0",
                avg_cycle_tobe=n.get("avgCycleTobe", ""),
                residual_bottlenecks=str(n.get("residualBottlenecks", "")),
                annual_volume=n.get("annualVolume", ""),
                review_months=n.get("reviewMonths") or None,
            )
            by_code[node.code] = node
            for r in n.get("risks", []):
                Risk.objects.create(
                    process=node,
                    risk_id=r["id"],
                    title=r["title"],
                    step=r.get("step", ""),
                    owner=r.get("owner", ""),
                    likelihood=r["likelihood"],
                    impact=r["impact"],
                    control=r.get("control", ""),
                    control_type=r.get("controlType", ""),
                    status=r.get("status", "Open"),
                )
            for d in n.get("docs", []):
                ProcessDocument.objects.create(
                    process=node,
                    doc_id=d["id"],
                    title=d["title"],
                    doc_type=d.get("type", ""),
                    version=d.get("version", ""),
                    url=d.get("url", ""),
                    step=d.get("step", ""),
                    owner=d.get("owner", ""),
                )

    def _versions(self, versions):
        keys = {}
        for v in sorted(versions, key=lambda x: x.get("createdAt") or ""):
            obj = ProcessVersion.objects.create(
                process=ProcessNode.objects.get(code=v["processId"]),
                kind=v["kind"],
                version=v["version"],
                status=v["status"],
                note=v.get("note", ""),
                bpmn_xml=v["xml"],
                based_on=keys.get(v.get("basedOn")),
                approved_by="Process owner" if v.get("approvedAt") else "",
                approved_at=parse_datetime(v["approvedAt"]) if v.get("approvedAt") else None,
            )
            if v.get("createdAt"):
                ProcessVersion.objects.filter(pk=obj.pk).update(created_at=parse_datetime(v["createdAt"]))
            keys[f"{v['processId']}__{v['kind']}__{v['version']}"] = obj

    def _activities(self, nodes, overrides):
        for n in nodes:
            if n["level"] != 3:
                continue
            process = ProcessNode.objects.get(code=n["code"])
            version = process_services.current_version(process)
            if version:
                process_services.sync_activities(version)
            for lane_name, role in (n.get("roleJobs") or {}).items():
                lane, _ = Lane.objects.get_or_create(process=process, name=lane_name)
                lane.is_external = bool(role.get("external"))
                lane.sub_job_family_id = None if lane.is_external else (role.get("sjf") or None)
                lane.save()
        for o in overrides:
            act = process_services.Activity.objects.filter(process__code=o["processId"], task_id=o["taskId"]).first()
            if not act:
                continue
            notes = o.get("notes", "")
            act.system = o.get("system", "")
            act.automation = o.get("automation") or act.automation
            act.traceable = bool(o.get("traceable"))
            act.steps = notes[len("Steps:") :].strip() if notes.startswith("Steps:") else notes
            act.data_in, act.data_out = o.get("dataIn", ""), o.get("dataOut", "")
            act.save()

    def _kpis(self, kpis):
        for code, name, desc in OBJECTIVES:
            StrategicObjective.objects.create(code=code, name=name, description=desc, is_outcome=code == "OBJ-05", order=int(code[-2:]))
        objs = {}
        for k in kpis:
            obj = Kpi(
                kpi_id=k["kpiId"],
                node=ProcessNode.objects.get(code=k["processId"]),
                level=k["level"],
                name=k["name"],
                definition=k.get("definition", ""),
                unit=k.get("unit", ""),
                direction=k.get("direction", "higher"),
                calc_type=k.get("kpiType", "Measured"),
                formula=k.get("formula", ""),
                source=k.get("source", ""),
                owner=k.get("owner", ""),
                from_task=k.get("fromTask", ""),
                to_task=k.get("toTask", ""),
                measure_process=k.get("measureProcess", ""),
                objective_id=k.get("objectiveId"),
                is_outcome=bool(k.get("outcome")),
                key=k.get("ck", ""),
                actual=_dec(k.get("actual")),
                baseline=_dec(k.get("baseline")),
                actual_period=k.get("actualPeriod", ""),
            )
            obj.clean()  # the demo library must respect the naming convention too
            obj.save()
            objs[obj.kpi_id] = obj
        for k in kpis:
            parent = objs[k["kpiId"]]
            for child in k.get("rollsUp") or []:
                KpiLink.objects.create(
                    parent=parent,
                    child=objs[child],
                    relation=KpiLink.Relation.ROLLS_UP,
                    weight=_dec((k.get("weights") or {}).get(child, 0)),
                )
            for child in k.get("explainedBy") or []:
                KpiLink.objects.create(parent=parent, child=objs[child], relation=KpiLink.Relation.EXPLAINS)

    def _targets(self, targets):
        for t in targets:
            KpiTarget.objects.create(
                target_id=t["targetId"],
                kpi=Kpi.objects.get(kpi_id=t["kpiId"]),
                scope=t.get("scope", "Company"),
                period=str(t.get("period", "")),
                green=_dec(t["green"]),
                amber=_dec(t["amber"]),
                reason=t.get("reason", ""),
                status=t.get("status", "Draft") if t.get("status") in {"Draft", "Active", "Expired"} else "Draft",
                approved_by="Process owner" if t.get("approvedAt") else "",
                approved_at=parse_datetime(t["approvedAt"]) if t.get("approvedAt") else None,
            )

    def _services(self, services):
        for s in services:
            obj = Service.objects.create(
                service_id=s["serviceId"],
                process=ProcessNode.objects.get(code=s["processId"]),
                name=s["name"],
                category=s.get("category", "Business"),
                description=s.get("description", ""),
                requester=s.get("requester", ""),
                channel=s.get("channel", ""),
                sla=s.get("sla", "") or "",
                owner=s.get("owner", ""),
                status=s.get("status", "Draft"),
                task_ids=s.get("tasks", []),
            )
            obj.kpis.set(Kpi.objects.filter(kpi_id__in=s.get("kpis", [])))

    def _history(self, audits):
        for a in audits:
            for e in a.get("entries", []):
                entry = AuditEntry.objects.create(
                    actor_label="Process owner",
                    action="import",
                    entity_type="process",
                    entity_id=a["processId"],
                    process_code=a["processId"],
                    summary=e["what"],
                )
                AuditEntry.objects.filter(pk=entry.pk).update(at=parse_datetime(e["at"]))

    def _pending(self, users):
        maker = users.get("editor") or "system"
        for v in ProcessVersion.objects.filter(status=ProcessVersion.Status.DRAFT):
            gov.submit_process_version(v, maker, "Demo: ready for review")
        for t in KpiTarget.objects.filter(status=KpiTarget.Status.DRAFT):
            gov.submit_kpi_target(t, maker, "Demo: proposed target")
