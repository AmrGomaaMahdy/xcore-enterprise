from rest_framework import serializers

from .models import BusinessUnit, Employee, Job, JobFamily, SubJobFamily


class BusinessUnitSerializer(serializers.ModelSerializer):
    class Meta:
        model = BusinessUnit
        fields = ["code", "name"]


class JobFamilySerializer(serializers.ModelSerializer):
    class Meta:
        model = JobFamily
        fields = ["code", "name"]


class SubJobFamilySerializer(serializers.ModelSerializer):
    job_family_name = serializers.CharField(source="job_family.name", read_only=True)
    employee_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = SubJobFamily
        fields = ["code", "name", "job_family", "job_family_name", "employee_count"]


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ["code", "title", "grade", "sub_job_family"]


class EmployeeSerializer(serializers.ModelSerializer):
    sub_job_family_name = serializers.CharField(source="sub_job_family.name", read_only=True)
    job_family = serializers.CharField(source="sub_job_family.job_family_id", read_only=True)
    job_family_name = serializers.CharField(source="sub_job_family.job_family.name", read_only=True)

    class Meta:
        model = Employee
        fields = ["employee_id", "sub_job_family", "sub_job_family_name", "job_family", "job_family_name", "business_unit", "since"]
