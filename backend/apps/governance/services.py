"""Maker-checker workflow. Each entity type registers how it is put in review and how approval is applied."""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.catalog.models import Service
from apps.core import audit
from apps.core.exceptions import DomainError
from apps.core.permissions import can_approve
from apps.kpis.models import KpiTarget
from apps.processes import services as process_services
from apps.processes.models import ProcessVersion

from .models import ApprovalRequest

ET = ApprovalRequest.EntityType


def _label(user) -> str:
    return (getattr(user, "display_name", "") or user.get_username()) if user else "system"


def _create(entity_type, obj, label, process_code, title, summary, user, comment) -> ApprovalRequest:
    if ApprovalRequest.objects.filter(entity_type=entity_type, entity_pk=obj.pk, status=ApprovalRequest.Status.PENDING).exists():
        raise DomainError("This item is already waiting for approval.", code="already_pending")
    req = ApprovalRequest.objects.create(
        entity_type=entity_type,
        entity_pk=obj.pk,
        entity_label=label,
        process_code=process_code,
        title=title,
        summary=summary,
        submitted_by=user if getattr(user, "is_authenticated", False) else None,
        submitted_label=_label(user) if getattr(user, "is_authenticated", False) else str(user or "system"),
        submit_comment=comment[:1000],
    )
    audit.record(user, "submit", entity_type, obj.pk, f"Submitted for approval: {title}", process_code=process_code)
    return req


@transaction.atomic
def submit_process_version(version: ProcessVersion, user, comment: str = "") -> ApprovalRequest:
    if version.status != ProcessVersion.Status.DRAFT:
        raise DomainError("Only a Draft version can be submitted.", code="not_draft")
    version.status = ProcessVersion.Status.IN_REVIEW
    version.save(update_fields=["status", "updated_at"])
    return _create(
        ET.PROCESS_VERSION,
        version,
        f"{version.process.code} {version.kind} v{version.version}",
        version.process.code,
        f"Approve {version.kind} v{version.version} of {version.process.code} {version.process.name}",
        version.note,
        user,
        comment,
    )


@transaction.atomic
def submit_kpi_target(target: KpiTarget, user, comment: str = "") -> ApprovalRequest:
    if target.status != KpiTarget.Status.DRAFT:
        raise DomainError("Only a Draft target can be submitted.", code="not_draft")
    target.status = KpiTarget.Status.IN_REVIEW
    target.save(update_fields=["status", "updated_at"])
    k = target.kpi
    return _create(
        ET.KPI_TARGET,
        target,
        target.target_id,
        k.node.code,
        f"Approve target {target.period} for {k.kpi_id} {k.name}",
        f"Green {target.green} · Amber {target.amber} {k.unit} ({target.scope}). {target.reason}",
        user,
        comment,
    )


@transaction.atomic
def submit_service(service: Service, user, comment: str = "") -> ApprovalRequest:
    if service.status != Service.Status.DRAFT:
        raise DomainError("Only a Draft service can be submitted.", code="not_draft")
    service.status = Service.Status.IN_REVIEW
    service.save(update_fields=["status", "updated_at"])
    return _create(
        ET.SERVICE,
        service,
        service.service_id,
        service.process.code,
        f"Publish service {service.service_id} {service.name}",
        service.description,
        user,
        comment,
    )


# ---------------------------------------------------------------- apply / revert
def _apply(req: ApprovalRequest, approver) -> None:
    now = timezone.now()
    if req.entity_type == ET.PROCESS_VERSION:
        process_services.apply_approval(ProcessVersion.objects.select_for_update().get(pk=req.entity_pk), _label(approver))
    elif req.entity_type == ET.KPI_TARGET:
        t = KpiTarget.objects.select_for_update().get(pk=req.entity_pk)
        KpiTarget.objects.filter(kpi=t.kpi, scope=t.scope, period=t.period, status=KpiTarget.Status.ACTIVE).exclude(pk=t.pk).update(
            status=KpiTarget.Status.EXPIRED
        )
        t.status, t.approved_by, t.approved_at = KpiTarget.Status.ACTIVE, _label(approver), now
        t.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
    elif req.entity_type == ET.SERVICE:
        Service.objects.filter(pk=req.entity_pk).update(status=Service.Status.APPROVED, updated_at=now)


def _revert(req: ApprovalRequest) -> None:
    if req.entity_type == ET.PROCESS_VERSION:
        ProcessVersion.objects.filter(pk=req.entity_pk, status=ProcessVersion.Status.IN_REVIEW).update(status=ProcessVersion.Status.DRAFT)
    elif req.entity_type == ET.KPI_TARGET:
        KpiTarget.objects.filter(pk=req.entity_pk, status=KpiTarget.Status.IN_REVIEW).update(status=KpiTarget.Status.DRAFT)
    elif req.entity_type == ET.SERVICE:
        Service.objects.filter(pk=req.entity_pk, status=Service.Status.IN_REVIEW).update(status=Service.Status.DRAFT)


@transaction.atomic
def decide(req_id: int, user, approve: bool, comment: str = "") -> ApprovalRequest:
    req = ApprovalRequest.objects.select_for_update().get(pk=req_id)
    if req.status != ApprovalRequest.Status.PENDING:
        raise DomainError("This request has already been decided.", code="already_decided")
    if not can_approve(user):
        raise DomainError("Only approvers can decide on approval requests.", code="forbidden")
    if req.submitted_by_id and req.submitted_by_id == user.pk:
        raise DomainError("Maker-checker: you cannot decide on a request you submitted.", code="maker_checker")
    if not approve and not comment.strip():
        raise DomainError("Give a reason when rejecting.", code="reason_required")
    if approve:
        _apply(req, user)
    else:
        _revert(req)
    req.status = ApprovalRequest.Status.APPROVED if approve else ApprovalRequest.Status.REJECTED
    req.decided_by, req.decided_label, req.decided_at, req.decision_comment = user, _label(user), timezone.now(), comment[:1000]
    req.save()
    audit.record(
        user,
        "approve" if approve else "reject",
        req.entity_type,
        req.entity_pk,
        f"{'Approved' if approve else 'Rejected'}: {req.title}",
        process_code=req.process_code,
    )
    return req


@transaction.atomic
def withdraw(req_id: int, user) -> ApprovalRequest:
    req = ApprovalRequest.objects.select_for_update().get(pk=req_id)
    if req.status != ApprovalRequest.Status.PENDING:
        raise DomainError("Only pending requests can be withdrawn.", code="already_decided")
    if req.submitted_by_id != user.pk and not user.is_superuser:
        raise DomainError("Only the submitter can withdraw a request.", code="forbidden")
    _revert(req)
    req.status = ApprovalRequest.Status.WITHDRAWN
    req.save(update_fields=["status"])
    audit.record(user, "withdraw", req.entity_type, req.entity_pk, f"Withdrew: {req.title}", process_code=req.process_code)
    return req
