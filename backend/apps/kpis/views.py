from django.db import transaction
from django.db.models import Prefetch
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import audit
from apps.core.audit import AuditedViewSetMixin
from apps.core.exceptions import DomainError
from apps.core.permissions import can_edit

from . import engine
from .models import Kpi, KpiLink, KpiTarget, StrategicObjective
from .serializers import KpiLinkSerializer, KpiSerializer, KpiTargetSerializer, StrategicObjectiveSerializer, WeightsSerializer


class StrategicObjectiveViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "objective"
    queryset = StrategicObjective.objects.all()
    serializer_class = StrategicObjectiveSerializer


class KpiViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """Enterprise KPI Library. Lookup by KPI id (e.g. /kpis/library/PRO-KPI-01/)."""

    audit_entity = "kpi"
    lookup_field = "kpi_id"
    serializer_class = KpiSerializer
    filterset_fields = ["level", "calc_type", "objective", "is_outcome", "direction", "node__code"]
    search_fields = ["kpi_id", "name", "definition", "owner"]

    def get_queryset(self):
        qs = Kpi.objects.select_related("node__parent__parent__parent", "objective").prefetch_related(
            Prefetch("child_links", queryset=KpiLink.objects.select_related("child")),
            Prefetch("parent_links", queryset=KpiLink.objects.select_related("parent")),
            "targets",
        )
        if process := self.request.query_params.get("process"):
            qs = qs.filter(node__code=process)
        return qs

    def _label(self, instance):
        return instance.kpi_id

    def perform_destroy(self, instance):
        if instance.parent_links.exists():
            raise DomainError("This KPI feeds other KPIs. Remove those links first.", code="in_use")
        super().perform_destroy(instance)

    @extend_schema(request=WeightsSerializer, responses=KpiSerializer)
    @action(detail=True, methods=["put"])
    @transaction.atomic
    def weights(self, request, kpi_id=None):
        """Replace the roll-up contributors and their weights (Derived weights must add up to 100)."""
        if not can_edit(request.user):
            raise DomainError("Your role can view but not change this content.", code="forbidden")
        kpi = self.get_object()
        if kpi.calc_type not in (Kpi.CalcType.DERIVED, Kpi.CalcType.GATE):
            raise DomainError("Only Derived or Gate KPIs have roll-up weights.", code="not_rollup")
        data = WeightsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        weights = data.validated_data["weights"]
        engine.validate_weights(kpi.calc_type, weights)
        children = {k.kpi_id: k for k in Kpi.objects.filter(kpi_id__in=weights)}
        if missing := set(weights) - set(children):
            raise DomainError(f"Unknown KPI(s): {', '.join(sorted(missing))}", code="unknown_kpi")
        if bad := [c for c in children.values() if c.level <= kpi.level]:
            raise DomainError(f"Contributors must sit below {kpi.kpi_id}: {', '.join(c.kpi_id for c in bad)}", code="tier")
        KpiLink.objects.filter(parent=kpi, relation=KpiLink.Relation.ROLLS_UP).delete()
        KpiLink.objects.bulk_create(
            [KpiLink(parent=kpi, child=children[c], relation=KpiLink.Relation.ROLLS_UP, weight=w) for c, w in weights.items()]
        )
        audit.record(
            request.user,
            "update",
            "kpi",
            kpi.kpi_id,
            f"Changed roll-up weights of {kpi.kpi_id}",
            process_code=kpi.node.code,
            changes={k: str(v) for k, v in weights.items()},
        )
        return Response(KpiSerializer(self.get_queryset().get(pk=kpi.pk)).data)

    @action(detail=True)
    def calculation(self, request, kpi_id=None):
        snap = engine.Snapshot.load()
        if kpi_id not in snap.kpis:
            raise DomainError("Unknown KPI.", code="not_found")
        kpi = snap.kpis[kpi_id]
        target = snap.targets.get(kpi_id)
        return Response(
            {
                "kpi_id": kpi_id,
                "rule": snap.rule_text(kpi_id),
                "score": snap.kpi_score(kpi_id),
                "health": engine.health(kpi.actual, target.green if target else None, target.amber if target else None, kpi.direction),
            }
        )


class KpiLinkViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "kpi_link"
    queryset = KpiLink.objects.select_related("parent", "child")
    serializer_class = KpiLinkSerializer
    filterset_fields = ["relation", "parent__kpi_id", "child__kpi_id"]


class KpiTargetViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "kpi_target"
    queryset = KpiTarget.objects.select_related("kpi__node")
    serializer_class = KpiTargetSerializer
    filterset_fields = ["status", "scope", "period", "kpi__kpi_id"]

    def perform_create(self, serializer):
        serializer.validated_data["status"] = KpiTarget.Status.DRAFT
        super().perform_create(serializer)

    def perform_destroy(self, instance):
        if instance.status != KpiTarget.Status.DRAFT:
            raise DomainError("Only Draft targets can be deleted.", code="not_draft")
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        if not can_edit(request.user):
            raise DomainError("Your role can view but not change this content.", code="forbidden")
        from apps.governance import services as gov

        req = gov.submit_kpi_target(self.get_object(), request.user, request.data.get("comment", ""))
        return Response({"approval_request": req.pk}, status=201)


class AlignmentView(APIView):
    """KPI Relationship & Alignment Matrix: Objective ↔ KPI ↔ process ↔ activity indicator."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(engine.Snapshot.load().alignment())


class CascadeView(APIView):
    """KPI hierarchy & cascade network (metadata only — no values)."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return Response(engine.Snapshot.load().cascade())
