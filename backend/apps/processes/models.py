"""
Business Process Library.

Hierarchy  L0 domain → L1 function → L2 sub-function → L3 process → L4 activity.
L0–L3 are ProcessNode rows; L4 activities come from the BPMN 2.0 model of the approved To-Be
version and are enriched here (system, automation, steps, data). Lanes are sub job families.
"""

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import TimeStampedModel


class ProcessNode(TimeStampedModel):
    class Level(models.IntegerChoices):
        DOMAIN = 0, "L0 · Domain"
        FUNCTION = 1, "L1 · Function"
        SUB_FUNCTION = 2, "L2 · Sub-function"
        PROCESS = 3, "L3 · Process"

    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        DRAFT = "Draft", "Draft"
        RETIRED = "Retired", "Retired"

    class Criticality(models.TextChoices):
        HIGH = "High", "High"
        MEDIUM = "Medium", "Medium"
        LOW = "Low", "Low"

    code = models.CharField(max_length=20, unique=True)
    level = models.PositiveSmallIntegerField(choices=Level.choices)
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.CharField(max_length=150, blank=True, help_text="Accountable role title")
    owner_job = models.ForeignKey("hcm.Job", null=True, blank=True, on_delete=models.SET_NULL, related_name="owned_processes")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    order = models.PositiveIntegerField(default=0)

    # L3 process attributes
    process_type = models.CharField(max_length=250, blank=True)
    business_units = models.JSONField(default=list, blank=True)
    systems = models.CharField(max_length=250, blank=True)
    criticality = models.CharField(max_length=10, choices=Criticality.choices, blank=True)
    job_family = models.CharField(max_length=120, blank=True)
    sub_job_family = models.CharField(max_length=150, blank=True)
    start_trigger = models.CharField(max_length=250, blank=True)
    applicable_domains = models.CharField(max_length=120, blank=True)
    modelling_standard = models.CharField(max_length=40, default="BPMN 2.0", blank=True)
    avg_cycle_tobe = models.CharField(max_length=120, blank=True)
    residual_bottlenecks = models.CharField(max_length=40, blank=True)
    annual_volume = models.CharField(max_length=120, blank=True)
    review_months = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MaxValueValidator(60)])

    class Meta:
        ordering = ["level", "order", "code"]
        indexes = [models.Index(fields=["level"]), models.Index(fields=["parent"])]

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"

    def audit_process_code(self) -> str:
        return self.code

    def ancestors(self) -> list["ProcessNode"]:
        chain, node = [], self.parent
        while node is not None:
            chain.insert(0, node)
            node = node.parent
        return chain

    def domain_code(self) -> str:
        chain = self.ancestors()
        return chain[0].code if chain else self.code


class ProcessVersion(TimeStampedModel):
    class Kind(models.TextChoices):
        AS_IS = "As-Is", "As-Is"
        TO_BE = "To-Be", "To-Be"

    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        IN_REVIEW = "In review", "In review"
        APPROVED = "Approved", "Approved"
        RETIRED = "Retired", "Retired"

    process = models.ForeignKey(ProcessNode, on_delete=models.CASCADE, related_name="versions", limit_choices_to={"level": 3})
    kind = models.CharField(max_length=10, choices=Kind.choices)
    version = models.CharField(max_length=10)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    note = models.TextField(blank=True)
    bpmn_xml = models.TextField()
    based_on = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="derived")
    approved_by = models.CharField(max_length=150, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["process__code", "kind", "-created_at"]
        constraints = [models.UniqueConstraint(fields=["process", "kind", "version"], name="uniq_process_kind_version")]

    def __str__(self) -> str:
        return f"{self.process.code} {self.kind} v{self.version} ({self.status})"

    @property
    def key(self) -> str:
        return f"{self.process.code}__{self.kind}__{self.version}"

    def audit_process_code(self) -> str:
        return self.process.code


class Lane(models.Model):
    """A BPMN lane = a sub job family (Oracle Fusion HCM) or an external party."""

    process = models.ForeignKey(ProcessNode, on_delete=models.CASCADE, related_name="lanes")
    name = models.CharField(max_length=150)
    sub_job_family = models.ForeignKey("hcm.SubJobFamily", null=True, blank=True, on_delete=models.SET_NULL, related_name="lanes")
    is_external = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["process__code", "order", "name"]
        constraints = [models.UniqueConstraint(fields=["process", "name"], name="uniq_process_lane")]

    def __str__(self) -> str:
        return f"{self.process.code} · {self.name}"

    def audit_process_code(self) -> str:
        return self.process.code


class Activity(TimeStampedModel):
    """L4 activity: identity comes from the BPMN model, the rest is maintained here."""

    class Automation(models.TextChoices):
        MANUAL = "Manual", "Manual"
        WORKFLOW = "Workflow", "Workflow"
        ASSISTED = "Assisted", "Assisted"
        AUTOMATED = "Automated", "Automated"

    FORCED_AUTOMATION = {
        "serviceTask": Automation.AUTOMATED,
        "scriptTask": Automation.AUTOMATED,
        "businessRuleTask": Automation.AUTOMATED,
        "manualTask": Automation.MANUAL,
    }

    process = models.ForeignKey(ProcessNode, on_delete=models.CASCADE, related_name="activities")
    task_id = models.CharField(max_length=40)
    name = models.CharField(max_length=250)
    bpmn_type = models.CharField(max_length=40, default="task")
    lane = models.CharField(max_length=150, blank=True)
    parent_task = models.CharField(max_length=40, blank=True, help_text="Enclosing sub-process id")
    parent_name = models.CharField(max_length=250, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    system = models.CharField(max_length=120, blank=True)
    automation = models.CharField(max_length=20, choices=Automation.choices, default=Automation.MANUAL)
    traceable = models.BooleanField(default=False, help_text="Leaves a timestamp in a system (needed to measure KPIs)")
    steps = models.TextField(blank=True)
    data_in = models.CharField(max_length=250, blank=True)
    data_out = models.CharField(max_length=250, blank=True)
    in_current_model = models.BooleanField(default=True)

    class Meta:
        ordering = ["process__code", "order", "task_id"]
        verbose_name_plural = "activities"
        constraints = [models.UniqueConstraint(fields=["process", "task_id"], name="uniq_process_task")]

    def __str__(self) -> str:
        return f"{self.task_id} · {self.name}"

    @property
    def automation_locked(self) -> bool:
        return self.bpmn_type in self.FORCED_AUTOMATION

    def save(self, *args, **kwargs):
        forced = self.FORCED_AUTOMATION.get(self.bpmn_type)
        if forced:
            self.automation = forced
        super().save(*args, **kwargs)

    def audit_process_code(self) -> str:
        return self.process.code


class Risk(TimeStampedModel):
    class ControlType(models.TextChoices):
        PREVENTIVE = "Preventive", "Preventive"
        DETECTIVE = "Detective", "Detective"
        CORRECTIVE = "Corrective", "Corrective"

    class Status(models.TextChoices):
        OPEN = "Open", "Open"
        MITIGATED = "Mitigated", "Mitigated"
        ACCEPTED = "Accepted", "Accepted"

    process = models.ForeignKey(ProcessNode, on_delete=models.CASCADE, related_name="risks")
    risk_id = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=250)
    step = models.CharField(max_length=40, blank=True, help_text="Activity task id")
    owner = models.CharField(max_length=150, blank=True)
    likelihood = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    impact = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    control = models.CharField(max_length=300, blank=True)
    control_type = models.CharField(max_length=20, choices=ControlType.choices, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)

    class Meta:
        ordering = ["process__code", "risk_id"]

    @property
    def rating(self) -> int:
        return self.likelihood * self.impact

    def __str__(self) -> str:
        return self.risk_id

    def audit_process_code(self) -> str:
        return self.process.code


class ProcessDocument(TimeStampedModel):
    process = models.ForeignKey(ProcessNode, on_delete=models.CASCADE, related_name="documents")
    doc_id = models.CharField(max_length=30)
    title = models.CharField(max_length=250)
    doc_type = models.CharField(max_length=60, blank=True)
    version = models.CharField(max_length=20, blank=True)
    url = models.URLField(blank=True)
    step = models.CharField(max_length=40, blank=True)
    owner = models.CharField(max_length=150, blank=True)

    class Meta:
        ordering = ["process__code", "doc_id"]
        constraints = [models.UniqueConstraint(fields=["process", "doc_id"], name="uniq_process_doc")]

    def __str__(self) -> str:
        return f"{self.doc_id} · {self.title}"

    def audit_process_code(self) -> str:
        return self.process.code
