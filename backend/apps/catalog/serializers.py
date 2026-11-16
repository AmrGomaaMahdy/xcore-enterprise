from rest_framework import serializers

from apps.kpis.models import Kpi
from apps.processes.models import Activity

from .models import Service


class ServiceSerializer(serializers.ModelSerializer):
    process_code = serializers.CharField(source="process.code", read_only=True)
    process_name = serializers.CharField(source="process.name", read_only=True)
    kpis = serializers.SlugRelatedField(slug_field="kpi_id", many=True, queryset=Kpi.objects.all(), required=False)
    activities = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            "id",
            "service_id",
            "process",
            "process_code",
            "process_name",
            "name",
            "category",
            "description",
            "requester",
            "channel",
            "trigger",
            "inputs",
            "output",
            "sla",
            "owner",
            "status",
            "task_ids",
            "activities",
            "kpis",
            "source_version",
            "generated",
            "confidence",
            "open_issues",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "generated", "confidence", "updated_at"]

    def get_activities(self, obj) -> list[dict]:
        names = dict(Activity.objects.filter(process=obj.process, task_id__in=obj.task_ids).values_list("task_id", "name"))
        return [{"task_id": t, "name": names.get(t, "")} for t in obj.task_ids]

    def validate_service_id(self, value):
        import re

        if not re.fullmatch(r"SVC-[A-Z0-9]{2,6}-\d{2}", value):
            raise serializers.ValidationError("Service ids follow SVC-<area>-nn (e.g. SVC-PO-05).")
        return value

    def validate(self, attrs):
        process = attrs.get("process", getattr(self.instance, "process", None))
        if process and process.level != 3:
            raise serializers.ValidationError({"process": "Services belong to an L3 process."})
        tasks = attrs.get("task_ids")
        if tasks is not None:
            if not isinstance(tasks, list) or not all(isinstance(t, str) for t in tasks):
                raise serializers.ValidationError({"task_ids": "Provide a list of task ids."})
            known = set(Activity.objects.filter(process=process, task_id__in=tasks).values_list("task_id", flat=True))
            if missing := [t for t in tasks if t not in known]:
                raise serializers.ValidationError({"task_ids": f"Not activities of {process.code}: {', '.join(missing)}"})
        if self.instance and self.instance.status == Service.Status.IN_REVIEW:
            raise serializers.ValidationError("The service is waiting for approval and cannot be changed.")
        return attrs


class AdoptSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=40)
    service_id = serializers.CharField(max_length=30)
