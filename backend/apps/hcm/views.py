from django.db.models import Count
from rest_framework import viewsets

from apps.core.permissions import ReadOnly

from .models import BusinessUnit, Employee, Job, JobFamily, SubJobFamily
from .serializers import (
    BusinessUnitSerializer,
    EmployeeSerializer,
    JobFamilySerializer,
    JobSerializer,
    SubJobFamilySerializer,
)


class BusinessUnitViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = BusinessUnit.objects.all()
    serializer_class = BusinessUnitSerializer
    permission_classes = [ReadOnly]


class JobFamilyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = JobFamily.objects.all()
    serializer_class = JobFamilySerializer
    permission_classes = [ReadOnly]


class SubJobFamilyViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SubJobFamily.objects.select_related("job_family").annotate(employee_count=Count("employees"))
    serializer_class = SubJobFamilySerializer
    permission_classes = [ReadOnly]
    filterset_fields = ["job_family"]


class JobViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Job.objects.all()
    serializer_class = JobSerializer
    permission_classes = [ReadOnly]


class EmployeeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Employee.objects.select_related("sub_job_family__job_family")
    serializer_class = EmployeeSerializer
    permission_classes = [ReadOnly]
    filterset_fields = ["sub_job_family", "business_unit"]
