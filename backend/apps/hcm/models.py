"""
Read-only copy of the Oracle Fusion HCM job architecture.

Rule: every employee carries a sub job family on their assignment (mandatory), and each
sub job family belongs by default to its job family. BPMN lanes link to sub job families,
so job and position are not needed to link people to processes or KPIs. IDs only — no names.
"""

from django.db import models


class BusinessUnit(models.Model):
    code = models.CharField(max_length=10, primary_key=True)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return self.name


class JobFamily(models.Model):
    code = models.CharField(max_length=10, primary_key=True)
    name = models.CharField(max_length=120)

    class Meta:
        ordering = ["code"]
        verbose_name_plural = "job families"

    def __str__(self) -> str:
        return self.name


class SubJobFamily(models.Model):
    code = models.CharField(max_length=20, primary_key=True)
    name = models.CharField(max_length=150)
    job_family = models.ForeignKey(JobFamily, on_delete=models.PROTECT, related_name="sub_job_families")

    class Meta:
        ordering = ["job_family_id", "code"]
        verbose_name_plural = "sub job families"

    def __str__(self) -> str:
        return self.name


class Job(models.Model):
    """Used only for the accountable process-owner job; not part of the lane linkage."""

    code = models.CharField(max_length=20, primary_key=True)
    title = models.CharField(max_length=150)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    sub_job_family = models.ForeignKey(SubJobFamily, on_delete=models.PROTECT, related_name="jobs")

    class Meta:
        ordering = ["code"]

    def __str__(self) -> str:
        return f"{self.code} · {self.title}"


class Employee(models.Model):
    employee_id = models.CharField(max_length=20, primary_key=True)
    sub_job_family = models.ForeignKey(SubJobFamily, on_delete=models.PROTECT, related_name="employees")
    business_unit = models.ForeignKey(BusinessUnit, null=True, blank=True, on_delete=models.SET_NULL)
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    since = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["employee_id"]

    @property
    def job_family(self) -> JobFamily:
        return self.sub_job_family.job_family

    def __str__(self) -> str:
        return self.employee_id
