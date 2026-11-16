from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import AuditEntry
from apps.core.permissions import ReadOnly

from . import impact, services
from .models import ApprovalRequest
from .serializers import ApprovalRequestSerializer, AuditEntrySerializer, DecisionSerializer


class ApprovalRequestViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = ApprovalRequest.objects.all()
    serializer_class = ApprovalRequestSerializer
    filterset_fields = ["status", "entity_type", "process_code"]

    def _decide(self, request, pk, approve):
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        req = services.decide(int(pk), request.user, approve, data.validated_data["comment"])
        return Response(self.get_serializer(req).data)

    @extend_schema(request=DecisionSerializer)
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        self.get_object()
        return self._decide(request, pk, True)

    @extend_schema(request=DecisionSerializer)
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        self.get_object()
        return self._decide(request, pk, False)

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=True)
    def context(self, request, pk=None):
        """Decision context: diff against the live version, quality checks, current vs proposed target."""
        return Response(services.context(self.get_object()))

    @extend_schema(responses=OpenApiTypes.OBJECT)
    @action(detail=False)
    def stats(self, request):
        from django.db.models import Count
        from django.utils import timezone

        qs = ApprovalRequest.objects.all()
        pending = list(qs.filter(status="pending").values_list("submitted_at", flat=True))
        now = timezone.now()
        ages = [(now - at).total_seconds() / 86400 for at in pending]
        return Response(
            {
                "by_status": {r["status"]: r["n"] for r in qs.values("status").annotate(n=Count("id"))},
                "pending_by_type": {
                    r["entity_type"]: r["n"] for r in qs.filter(status="pending").values("entity_type").annotate(n=Count("id"))
                },
                "pending_by_process": {
                    r["process_code"]: r["n"] for r in qs.filter(status="pending").values("process_code").annotate(n=Count("id"))
                },
                "oldest_pending_days": round(max(ages), 1) if ages else 0,
                "avg_pending_days": round(sum(ages) / len(ages), 1) if ages else 0,
                "overdue": sum(1 for a in ages if a > 5),
            }
        )

    @action(detail=True, methods=["post"])
    def withdraw(self, request, pk=None):
        self.get_object()
        return Response(self.get_serializer(services.withdraw(int(pk), request.user)).data)


class ImpactView(APIView):
    permission_classes = [ReadOnly]

    @extend_schema(parameters=[OpenApiParameter("type", str, enum=list(impact.TYPES)), OpenApiParameter("ref", str)])
    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        kind, ref = request.query_params.get("type"), (request.query_params.get("ref") or "").strip()[:120]
        if not kind or not ref:
            return Response(impact.options())
        return Response(impact.analyse(kind, ref))


class AuditViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditEntry.objects.all().order_by("-at")
    serializer_class = AuditEntrySerializer
    permission_classes = [ReadOnly]
    filterset_fields = ["process_code", "entity_type", "action"]
    search_fields = ["summary", "actor_label", "entity_id"]
