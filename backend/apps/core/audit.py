"""Single entry point for writing the audit trail."""

from __future__ import annotations

from typing import Any

from .models import AuditEntry


def record(
    actor,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
    *,
    process_code: str = "",
    changes: dict[str, Any] | None = None,
) -> AuditEntry:
    label = ""
    if actor is not None and getattr(actor, "is_authenticated", False):
        label = getattr(actor, "display_name", "") or actor.get_username()
        actor_obj = actor
    else:
        actor_obj = None
        label = str(actor or "system")
    return AuditEntry.objects.create(
        actor=actor_obj,
        actor_label=label[:150],
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id)[:120],
        process_code=process_code or "",
        summary=summary[:500],
        changes=changes or {},
    )


class AuditedViewSetMixin:
    """Records create / update / delete on any ModelViewSet and stamps created_by / updated_by."""

    audit_entity: str = ""

    def _process_code(self, instance) -> str:
        getter = getattr(instance, "audit_process_code", None)
        return getter() if callable(getter) else ""

    def _label(self, instance) -> str:
        return str(instance)

    def perform_create(self, serializer):
        extra = {"created_by": self.request.user, "updated_by": self.request.user} if hasattr(serializer.Meta.model, "created_by") else {}
        instance = serializer.save(**extra)
        record(
            self.request.user,
            "create",
            self.audit_entity,
            getattr(instance, "pk", ""),
            f"Created {self.audit_entity} {self._label(instance)}",
            process_code=self._process_code(instance),
        )

    def perform_update(self, serializer):
        changed = {k: str(v)[:200] for k, v in serializer.validated_data.items()}
        extra = {"updated_by": self.request.user} if hasattr(serializer.Meta.model, "updated_by") else {}
        instance = serializer.save(**extra)
        record(
            self.request.user,
            "update",
            self.audit_entity,
            getattr(instance, "pk", ""),
            f"Updated {self.audit_entity} {self._label(instance)}: {', '.join(changed)}",
            process_code=self._process_code(instance),
            changes=changed,
        )

    def perform_destroy(self, instance):
        label, code, pk = self._label(instance), self._process_code(instance), instance.pk
        instance.delete()
        record(self.request.user, "delete", self.audit_entity, pk, f"Deleted {self.audit_entity} {label}", process_code=code)
