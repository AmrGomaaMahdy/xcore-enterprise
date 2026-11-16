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

        acts = Activity.objects.filter(in_current_model=True)
        return Response(
            {
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
