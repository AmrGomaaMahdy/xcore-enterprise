from django.conf import settings
from django.db import models


class ApprovalRequest(models.Model):
    """Maker-checker request. The checker can never be the maker."""

    class EntityType(models.TextChoices):
        PROCESS_VERSION = "process_version", "Process model version"
        KPI_TARGET = "kpi_target", "KPI target"
        SERVICE = "service", "Catalog service"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    entity_type = models.CharField(max_length=30, choices=EntityType.choices)
    entity_pk = models.PositiveIntegerField()
    entity_label = models.CharField(max_length=200)
    process_code = models.CharField(max_length=20, blank=True, db_index=True)
    title = models.CharField(max_length=250)
    summary = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="approval_requests")
    submitted_label = models.CharField(max_length=150, blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)
    submit_comment = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="approval_decisions"
    )
    decided_label = models.CharField(max_length=150, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_comment = models.TextField(blank=True)

    class Meta:
        ordering = ["-submitted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["entity_type", "entity_pk"], condition=models.Q(status="pending"), name="one_pending_request_per_entity"
            ),
        ]

    def __str__(self) -> str:
        return f"#{self.pk} {self.title} ({self.status})"
