from django.db.models import Q
from django.http import HttpResponse
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.audit import AuditedViewSetMixin
from apps.core.exceptions import DomainError
from apps.core.permissions import can_edit

from . import bpmn, services
from .models import Activity, Lane, ProcessDocument, ProcessNode, ProcessVersion, Risk
from .serializers import (
    ActivitySerializer,
    BpmnSaveSerializer,
    LaneSerializer,
    NewDraftSerializer,
    ProcessDocumentSerializer,
    ProcessNodeSerializer,
    ProcessNodeTreeSerializer,
    ProcessVersionDetailSerializer,
    ProcessVersionListSerializer,
    RiskSerializer,
)


def _require_edit(request):
    if not can_edit(request.user):
        raise DomainError("Your role can view but not change this content.", code="forbidden")


class ProcessNodeViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    """L0–L3 of the Business Process Library. Lookup by code (e.g. /processes/nodes/15-030/)."""

    audit_entity = "process_node"
    lookup_field = "code"
    queryset = ProcessNode.objects.select_related("parent", "owner_job")
    serializer_class = ProcessNodeSerializer
    filterset_fields = ["level", "parent", "status", "criticality"]
    search_fields = ["code", "name", "description", "owner"]

    def get_serializer_class(self):
        return ProcessNodeTreeSerializer if self.action == "tree" else ProcessNodeSerializer

    def perform_destroy(self, instance):
        if instance.children.exists() or instance.versions.exists():
            raise DomainError("Retire the node instead: it still has children or model versions.", code="in_use")
        super().perform_destroy(instance)

    @extend_schema(responses=ProcessNodeTreeSerializer(many=True))
    @action(detail=False)
    def tree(self, request):
        """Flat list for the repository tree; the client nests it by `parent`."""
        return Response(ProcessNodeTreeSerializer(ProcessNode.objects.all(), many=True).data)

    @action(detail=True)
    def raci(self, request, code=None):
        return Response(services.raci(self.get_object()))

    @action(detail=True)
    def quality(self, request, code=None):
        return Response(services.quality_checklist(self.get_object()))

    @action(detail=True)
    def sod(self, request, code=None):
        return Response(services.sod_conflicts(self.get_object()))

    @action(detail=True)
    def history(self, request, code=None):
        from apps.core.models import AuditEntry

        rows = AuditEntry.objects.filter(process_code=code).order_by("-at")[:200]
        return Response([{"at": r.at, "by": r.actor_label, "action": r.action, "what": r.summary} for r in rows])


class ProcessVersionViewSet(
    AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet
):
    audit_entity = "process_version"
    queryset = ProcessVersion.objects.select_related("process", "based_on")
    filterset_fields = ["process", "process__code", "kind", "status"]

    def get_serializer_class(self):
        return ProcessVersionDetailSerializer if self.action == "retrieve" else ProcessVersionListSerializer

    def perform_destroy(self, instance):
        if instance.status != ProcessVersion.Status.DRAFT:
            raise DomainError("Only drafts can be discarded; approved versions are kept for traceability.", code="not_draft")
        super().perform_destroy(instance)

    @extend_schema(request=NewDraftSerializer, responses=ProcessVersionListSerializer)
    @action(detail=True, methods=["post"], url_path="new-draft")
    def new_draft(self, request, pk=None):
        _require_edit(request)
        data = NewDraftSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        draft = services.new_draft(self.get_object(), request.user, data.validated_data.get("note", ""))
        return Response(ProcessVersionListSerializer(draft).data, status=201)

    @extend_schema(request=BpmnSaveSerializer, responses=ProcessVersionListSerializer)
    @action(detail=True, methods=["put"], url_path="model")
    def save_model(self, request, pk=None):
        _require_edit(request)
        data = BpmnSaveSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            version = services.save_model(self.get_object(), data.validated_data["bpmn_xml"], request.user)
        except bpmn.BpmnError as exc:
            raise DomainError(str(exc), code="invalid_bpmn") from exc
        return Response(ProcessVersionListSerializer(version).data)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        """Maker step: send a draft to the approval queue."""
        _require_edit(request)
        from apps.governance import services as gov

        version = self.get_object()
        try:
            bpmn.parse(version.bpmn_xml)
        except bpmn.BpmnError as exc:
            raise DomainError(str(exc), code="invalid_bpmn") from exc
        req = gov.submit_process_version(version, request.user, request.data.get("comment", ""))
        return Response({"approval_request": req.pk, "status": version.status}, status=201)

    @action(detail=True)
    def export(self, request, pk=None):
        version = self.get_object()
        name = f"{version.process.code}_{version.kind}_v{version.version}.bpmn".replace(" ", "_")
        response = HttpResponse(version.bpmn_xml, content_type="application/xml; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        response["X-Content-Type-Options"] = "nosniff"
        return response

    @action(detail=True)
    def parsed(self, request, pk=None):
        """Activities and lanes found in this model (used by the diff and the Activities tab)."""
        try:
            model = bpmn.parse(self.get_object().bpmn_xml)
        except bpmn.BpmnError as exc:
            raise DomainError(str(exc), code="invalid_bpmn") from exc
        return Response({"lanes": model.lanes, "tasks": [t.__dict__ for t in model.tasks], "sub_processes": model.sub_processes})


class ActivityViewSet(
    AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet
):
    """L4 activities. Created/renamed only by syncing the approved To-Be model; enrichment is editable."""

    audit_entity = "activity"
    serializer_class = ActivitySerializer
    filterset_fields = ["process", "process__code", "automation", "traceable", "in_current_model", "lane", "system"]
    search_fields = ["task_id", "name", "system", "steps"]

    def get_queryset(self):
        qs = Activity.objects.select_related("process__parent__parent__parent")
        for param, field in (
            ("domain", "process__parent__parent__parent__code"),
            ("function", "process__parent__parent__code"),
            ("sub_function", "process__parent__code"),
        ):
            if value := self.request.query_params.get(param):
                qs = qs.filter(**{field: value})
        return qs

    def _label(self, instance):
        return instance.task_id

    @action(detail=False)
    def heatmap(self, request):
        """Automation & traceability heat map rows (Activity automation map)."""
        qs = self.filter_queryset(self.get_queryset()).filter(in_current_model=True)
        rows = {}
        for a in qs:
            key = a.process.code
            row = rows.setdefault(
                key,
                {
                    "process": key,
                    "name": a.process.name,
                    "Manual": 0,
                    "Workflow": 0,
                    "Assisted": 0,
                    "Automated": 0,
                    "traceable": 0,
                    "total": 0,
                },
            )
            row[a.automation] += 1
            row["traceable"] += a.traceable
            row["total"] += 1
        return Response(list(rows.values()))


class LaneViewSet(AuditedViewSetMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    audit_entity = "lane"
    queryset = Lane.objects.select_related("process", "sub_job_family__job_family")
    serializer_class = LaneSerializer
    filterset_fields = ["process", "process__code", "sub_job_family", "is_external"]


class RiskViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "risk"
    queryset = Risk.objects.select_related("process")
    serializer_class = RiskSerializer
    filterset_fields = ["process", "process__code", "status", "control_type"]


class ProcessDocumentViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "document"
    queryset = ProcessDocument.objects.select_related("process")
    serializer_class = ProcessDocumentSerializer
    filterset_fields = ["process", "process__code"]


class SearchViewSet(viewsets.ViewSet):
    """Global search across the library (header search box)."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def list(self, request):
        q = (request.query_params.get("q") or "").strip()[:80]
        if len(q) < 2:
            return Response([])
        nodes = ProcessNode.objects.filter(Q(code__icontains=q) | Q(name__icontains=q))[:10]
        acts = Activity.objects.filter(Q(task_id__icontains=q) | Q(name__icontains=q), in_current_model=True).select_related("process")[:10]
        return Response(
            [{"type": "process", "code": n.code, "name": n.name, "level": n.level} for n in nodes]
            + [{"type": "activity", "code": a.task_id, "name": a.name, "process": a.process.code} for a in acts]
        )
