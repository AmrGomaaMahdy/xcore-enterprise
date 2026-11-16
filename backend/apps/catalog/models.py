from django.db import models

from apps.core.models import TimeStampedModel


class Service(TimeStampedModel):
    """A business service traced to the To-Be activities that deliver it and the KPIs that measure it."""

    class Category(models.TextChoices):
        BUSINESS = "Business", "Business service"
        IT = "IT", "IT service"
        PROCESS = "Process", "Process / activity service"

    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        IN_REVIEW = "In review", "In review"
        APPROVED = "Approved", "Approved"
        RETIRED = "Retired", "Retired"

    service_id = models.CharField(max_length=30, unique=True)
    process = models.ForeignKey("processes.ProcessNode", on_delete=models.PROTECT, related_name="services", limit_choices_to={"level": 3})
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.BUSINESS)
    description = models.TextField(blank=True)
    requester = models.CharField(max_length=200, blank=True)
    channel = models.CharField(max_length=200, blank=True)
    trigger = models.CharField(max_length=250, blank=True)
    inputs = models.CharField(max_length=400, blank=True)
    output = models.CharField(max_length=300, blank=True)
    sla = models.CharField(max_length=60, blank=True, help_text="Left blank until the service owner commits to one")
    owner = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    task_ids = models.JSONField(default=list, blank=True, help_text="Delivering L4 activities (task ids)")
    kpis = models.ManyToManyField("kpis.Kpi", blank=True, related_name="services")
    source_version = models.CharField(max_length=60, blank=True, help_text="Process version the service was derived from")
    generated = models.BooleanField(default=False)
    confidence = models.PositiveSmallIntegerField(null=True, blank=True)
    open_issues = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["process__code", "service_id"]

    def __str__(self) -> str:
        return f"{self.service_id} · {self.name}"

    def audit_process_code(self) -> str:
        return self.process.code
