"""
Enterprise KPI Library and KPI Relationship & Alignment Matrix.

Tiers follow the process hierarchy:
  L0 Strategic KPI → L1 Functional KPI → L2 Sub-functional KPI → L3 Process KPI → L4 Operational indicator
Naming convention: <node code>-KPI-nn (L0–L3), <process code>-OI-nn (L4), ENT-KPI-nn (enterprise outcome).
"""

import re

from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TimeStampedModel

TIER_NAMES = {0: "Strategic KPI", 1: "Functional KPI", 2: "Sub-functional KPI", 3: "Process KPI", 4: "Operational indicator"}


class StrategicObjective(models.Model):
    code = models.CharField(max_length=10, primary_key=True)  # OBJ-01
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_outcome = models.BooleanField(default=False, help_text="Result of the other objectives (kept off the cascade network)")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "code"]

    def clean(self):
        if not re.fullmatch(r"OBJ-\d{2}", self.code):
            raise ValidationError({"code": "Objective codes follow OBJ-nn."})

    def __str__(self) -> str:
        return f"{self.code} · {self.name}"


class Kpi(TimeStampedModel):
    class Direction(models.TextChoices):
        HIGHER = "higher", "Higher is better"
        LOWER = "lower", "Lower is better"

    class CalcType(models.TextChoices):
        MEASURED = "Measured", "Measured (from → to activity)"
        DERIVED = "Derived", "Derived (weighted average)"
        GATE = "Gate", "Gate (worst of contributors)"
        DIRECT = "Direct", "Direct (own measurement, explained by drivers)"

    kpi_id = models.CharField(max_length=30, unique=True)
    node = models.ForeignKey("processes.ProcessNode", on_delete=models.PROTECT, related_name="kpis")
    level = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=200)
    definition = models.TextField(blank=True)
    unit = models.CharField(max_length=20, blank=True)
    direction = models.CharField(max_length=10, choices=Direction.choices, default=Direction.HIGHER)
    calc_type = models.CharField(max_length=10, choices=CalcType.choices, default=CalcType.MEASURED)
    formula = models.CharField(max_length=300, blank=True)
    source = models.CharField(max_length=200, blank=True)
    owner = models.CharField(max_length=150, blank=True)
    from_task = models.CharField(max_length=40, blank=True)
    to_task = models.CharField(max_length=40, blank=True)
    measure_process = models.CharField(max_length=20, blank=True)
    objective = models.ForeignKey(StrategicObjective, null=True, blank=True, on_delete=models.SET_NULL, related_name="kpis")
    is_outcome = models.BooleanField(default=False)
    key = models.CharField(max_length=40, blank=True, help_text="Short key used by dashboards")
    # last reported values (the Performance Center module will own these in production)
    actual = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    baseline = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    actual_period = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["level", "kpi_id"]
        indexes = [models.Index(fields=["level"]), models.Index(fields=["node"])]

    @property
    def tier(self) -> str:
        return "Strategic KPI · enterprise outcome" if self.is_outcome else TIER_NAMES.get(self.level, "")

    def expected_prefix(self) -> str:
        return "ENT" if self.is_outcome else self.node.code

    def clean(self):
        if self.node_id is None:
            return
        kind = "OI" if self.level == 4 else "KPI"
        pattern = rf"{re.escape(self.expected_prefix())}-{kind}-\d{{2}}"
        if not re.fullmatch(pattern, self.kpi_id):
            raise ValidationError({"kpi_id": f"Expected {self.expected_prefix()}-{kind}-nn for this level and node."})
        expected_node_level = min(self.level, 3)
        if self.node.level != expected_node_level:
            raise ValidationError({"node": f"An L{self.level} KPI belongs to an L{expected_node_level} node."})
        if self.calc_type == self.CalcType.MEASURED and self.level >= 3 and not self.from_task:
            raise ValidationError({"from_task": "A measured KPI needs the activity it is measured on (from, and optionally to)."})
        if self.objective_id and self.level != 0:
            raise ValidationError({"objective": "Only strategic (L0) KPIs link directly to an objective."})

    def __str__(self) -> str:
        return f"{self.kpi_id} · {self.name}"

    def audit_process_code(self) -> str:
        return self.node.code


class KpiLink(models.Model):
    """Edge in the alignment matrix. ROLLS_UP carries a weight; EXPLAINS marks a driver (no weight)."""

    class Relation(models.TextChoices):
        ROLLS_UP = "rolls_up", "Rolls up (weighted)"
        EXPLAINS = "explains", "Explained by (driver)"

    parent = models.ForeignKey(Kpi, on_delete=models.CASCADE, related_name="child_links")
    child = models.ForeignKey(Kpi, on_delete=models.CASCADE, related_name="parent_links")
    relation = models.CharField(max_length=10, choices=Relation.choices)
    weight = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ["parent__kpi_id", "relation", "-weight"]
        constraints = [
            models.UniqueConstraint(fields=["parent", "child", "relation"], name="uniq_kpi_link"),
            models.CheckConstraint(condition=~models.Q(parent=models.F("child")), name="kpi_link_not_self"),
        ]

    def __str__(self) -> str:
        return f"{self.parent.kpi_id} ← {self.child.kpi_id} ({self.relation})"


class KpiTarget(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "Draft", "Draft"
        IN_REVIEW = "In review", "In review"
        ACTIVE = "Active", "Active"
        EXPIRED = "Expired", "Expired"

    target_id = models.CharField(max_length=40, unique=True)
    kpi = models.ForeignKey(Kpi, on_delete=models.CASCADE, related_name="targets")
    scope = models.CharField(max_length=60, default="Company")
    period = models.CharField(max_length=20)
    green = models.DecimalField(max_digits=14, decimal_places=2)
    amber = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.CharField(max_length=300, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    approved_by = models.CharField(max_length=150, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["kpi__kpi_id", "-period"]

    def clean(self):
        if self.kpi_id is None:
            return
        higher = self.kpi.direction == Kpi.Direction.HIGHER
        if higher and self.amber > self.green:
            raise ValidationError({"amber": "For higher-is-better KPIs the amber threshold must be at or below green."})
        if not higher and self.amber < self.green:
            raise ValidationError({"amber": "For lower-is-better KPIs the amber threshold must be at or above green."})

    def __str__(self) -> str:
        return self.target_id

    def audit_process_code(self) -> str:
        return self.kpi.node.code
