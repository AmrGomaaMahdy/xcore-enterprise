"""Shared base models and the platform-wide audit trail."""

from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """Adds creation / update timestamps and the acting user to every business record."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        abstract = True


class AuditEntry(models.Model):
    """Immutable record of every change (who, what, when) — the History tab and the audit log."""

    at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    actor_label = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=40)  # create / update / delete / approve / reject / submit / import
    entity_type = models.CharField(max_length=60, db_index=True)
    entity_id = models.CharField(max_length=120, db_index=True)
    process_code = models.CharField(max_length=40, blank=True, db_index=True)
    summary = models.CharField(max_length=500)
    changes = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-at", "-id"]
        verbose_name_plural = "audit entries"

    def __str__(self) -> str:
        return f"{self.at:%Y-%m-%d %H:%M} {self.actor_label} {self.summary}"
