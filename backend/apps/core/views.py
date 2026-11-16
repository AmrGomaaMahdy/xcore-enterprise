from django.db import connection
from django.db.models import Count
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Liveness/readiness probe for Docker and load balancers. Reveals nothing but ok/fail."""

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes: list = []

    @extend_schema(responses={200: dict})
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            return Response({"status": "ok"})
        except Exception:  # noqa: BLE001 — never leak DB errors
            return Response({"status": "unavailable"}, status=503)


class OverviewView(APIView):
    """Landing-page figures for the Process Hub."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.catalog.models import Service
        from apps.core.models import AuditEntry
        from apps.governance.models import ApprovalRequest
        from apps.hcm.models import Employee, SubJobFamily
        from apps.kpis.models import Kpi, KpiTarget, StrategicObjective
        from apps.processes.models import Activity, ProcessNode, ProcessVersion

        def counts(qs, field):
            return {row[field]: row["n"] for row in qs.values(field).annotate(n=Count("id"))}

        from apps.processes.services import current_version, quality_checklist

        acts = Activity.objects.filter(in_current_model=True)
        processes = []
        for p in ProcessNode.objects.filter(level=3).select_related("parent"):
            checks = quality_checklist(p)
            tobe = current_version(p)
            processes.append(
                {
                    "code": p.code,
                    "name": p.name,
                    "parent": p.parent.code if p.parent else None,
                    "owner": p.owner,
                    "criticality": p.criticality,
                    "activities": p.activities.filter(in_current_model=True).count(),
                    "kpis": Kpi.objects.filter(node=p).count(),
                    "risks": p.risks.count(),
                    "tobe": f"v{tobe.version}" if tobe else None,
                    "quality": round(100 * sum(c["ok"] for c in checks) / len(checks)) if checks else 0,
                }
            )
        domains = [
            {
                "code": d.code,
                "name": d.name,
                "functions": d.children.count(),
                "processes": ProcessNode.objects.filter(level=3, parent__parent__parent=d).count(),
            }
            for d in ProcessNode.objects.filter(level=0)
        ]
        return Response(
            {
                "processes": processes,
                "domains": domains,
                "nodes": {str(k): v for k, v in counts(ProcessNode.objects.all(), "level").items()},
                "versions": counts(ProcessVersion.objects.all(), "status"),
                "activities": {
                    "total": acts.count(),
                    "traceable": acts.filter(traceable=True).count(),
                    "by_automation": counts(acts, "automation"),
                },
                "kpis": {"total": Kpi.objects.count(), "by_level": {str(k): v for k, v in counts(Kpi.objects.all(), "level").items()}},
                "objectives": StrategicObjective.objects.count(),
                "targets": counts(KpiTarget.objects.all(), "status"),
                "services": counts(Service.objects.all(), "status"),
                "approvals_pending": ApprovalRequest.objects.filter(status="pending").count(),
                "hcm": {"sub_job_families": SubJobFamily.objects.count(), "employees": Employee.objects.count()},
                "recent": list(AuditEntry.objects.order_by("-at").values("at", "actor_label", "summary", "process_code")[:8]),
            }
        )
