from django.db import transaction
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
from apps.kpis.models import Kpi
from apps.processes.models import ProcessNode
from apps.processes.services import current_version

from .generator import get_generator, library
from .models import Service
from .serializers import AdoptSerializer, ServiceSerializer


class ServiceViewSet(AuditedViewSetMixin, viewsets.ModelViewSet):
    audit_entity = "service"
    queryset = Service.objects.select_related("process").prefetch_related("kpis")
    serializer_class = ServiceSerializer
    filterset_fields = ["process__code", "status", "category"]
    search_fields = ["service_id", "name", "description", "owner"]

    def _label(self, instance):
        return instance.service_id

    def perform_destroy(self, instance):
        if instance.status != Service.Status.DRAFT:
            raise DomainError("Only draft services can be deleted; retire approved ones.", code="not_draft")
        super().perform_destroy(instance)

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        if not can_edit(request.user):
            raise DomainError("Your role can view but not change this content.", code="forbidden")
        from apps.governance import services as gov

        service = self.get_object()
        problems = [
            f for f, v in (("owner", service.owner), ("description", service.description), ("activities", service.task_ids)) if not v
        ]
        if problems:
            raise DomainError(f"Complete before submitting: {', '.join(problems)}.", code="incomplete")
        req = gov.submit_service(service, request.user, request.data.get("comment", ""))
        return Response({"approval_request": req.pk}, status=201)


class GeneratorView(APIView):
    """Propose services from the approved To-Be model of an L3 process (?process=15-030)."""

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        code = request.query_params.get("process", "")
        process = ProcessNode.objects.filter(code=code, level=3).first()
        if not process:
            meta = library()
            return Response(
                {
                    "rules": meta["rules"],
                    "pipeline": meta["pipeline"],
                    "catalog_types": meta["catalog_types"],
                    "processes": list(ProcessNode.objects.filter(level=3).values("code", "name")),
                }
            )
        version = current_version(process)
        if version is None:
            raise DomainError("This process has no approved To-Be model yet.", code="no_tobe")
        candidates = get_generator().generate(process, version)
        return Response(
            {
                "process": process.code,
                "source_version": f"{version.kind} v{version.version}",
                "candidates": [c.to_dict() for c in candidates],
            }
        )


class AdoptView(APIView):
    """Turn a generated candidate into a Draft catalog entry (human approval follows via governance)."""

    @extend_schema(request=AdoptSerializer, responses=ServiceSerializer)
    @transaction.atomic
    def post(self, request, code: str):
        if not can_edit(request.user):
            raise DomainError("Your role can view but not change this content.", code="forbidden")
        data = AdoptSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        process = ProcessNode.objects.filter(code=code, level=3).first()
        if not process:
            raise DomainError("Unknown process.", code="not_found")
        version = current_version(process)
        cand = next((c for c in get_generator().generate(process, version) if c.key == data.validated_data["key"]), None)
        if cand is None:
            raise DomainError("Candidate not found — regenerate and try again.", code="not_found")
        if cand.verdict != "service":
            raise DomainError(f"This candidate is marked '{cand.verdict}', not a new service.", code="not_service")
        if Service.objects.filter(service_id=data.validated_data["service_id"]).exists():
            raise DomainError("That service id is already used.", code="duplicate")
        service = ServiceSerializer(
            data={
                "service_id": data.validated_data["service_id"],
                "process": process.pk,
                "name": cand.name,
                "category": cand.category,
                "description": cand.description,
                "requester": cand.recipient,
                "trigger": cand.trigger,
                "inputs": cand.inputs,
                "output": cand.output,
                "owner": cand.owner,
                "sla": cand.sla or "",
                "channel": cand.system,
                "task_ids": [e["task_id"] for e in cand.evidence[:1]],
                "kpis": [k["kpi_id"] for k in cand.kpis if k["kpi_id"] and Kpi.objects.filter(kpi_id=k["kpi_id"]).exists()],
                "source_version": cand.source_version,
                "open_issues": cand.flags,
            }
        )
        service.is_valid(raise_exception=True)
        obj = service.save(generated=True, confidence=cand.confidence, created_by=request.user, updated_by=request.user)
        audit.record(
            request.user,
            "create",
            "service",
            obj.pk,
            f"Adopted generated candidate {cand.name} as {obj.service_id}",
            process_code=process.code,
        )
        return Response(ServiceSerializer(obj).data, status=201)
