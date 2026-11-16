from rest_framework import serializers

from .models import Activity, Lane, ProcessDocument, ProcessNode, ProcessVersion, Risk


class ProcessNodeTreeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessNode
        fields = ["id", "code", "level", "parent", "name", "status", "order", "owner"]


class ProcessNodeSerializer(serializers.ModelSerializer):
    parent_code = serializers.CharField(source="parent.code", read_only=True, default=None)
    path = serializers.SerializerMethodField()
    counts = serializers.SerializerMethodField()

    class Meta:
        model = ProcessNode
        fields = [
            "id",
            "code",
            "level",
            "parent",
            "parent_code",
            "path",
            "name",
            "description",
            "owner",
            "owner_job",
            "status",
            "order",
            "process_type",
            "business_units",
            "systems",
            "criticality",
            "job_family",
            "sub_job_family",
            "start_trigger",
            "applicable_domains",
            "modelling_standard",
            "avg_cycle_tobe",
            "residual_bottlenecks",
            "annual_volume",
            "review_months",
            "counts",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]

    def get_path(self, obj) -> list[dict]:
        return [{"code": n.code, "name": n.name, "level": n.level} for n in obj.ancestors()]

    def get_counts(self, obj) -> dict:
        if obj.level != 3:
            return {"children": obj.children.count()}
        return {
            "activities": obj.activities.filter(in_current_model=True).count(),
            "versions": obj.versions.count(),
            "risks": obj.risks.count(),
            "documents": obj.documents.count(),
        }

    def validate(self, attrs):
        level = attrs.get("level", getattr(self.instance, "level", None))
        parent = attrs.get("parent", getattr(self.instance, "parent", None))
        if level == 0 and parent is not None:
            raise serializers.ValidationError({"parent": "An L0 domain has no parent."})
        if level and (parent is None or parent.level != level - 1):
            raise serializers.ValidationError({"parent": f"An L{level} node must sit under an L{level - 1} node."})
        return attrs

    def validate_code(self, value):
        import re

        if not re.fullmatch(r"[A-Z0-9][A-Z0-9-]{1,19}", value):
            raise serializers.ValidationError("Use 2–20 upper-case letters, digits or hyphens (e.g. PRO or 15-030).")
        return value


class ProcessVersionListSerializer(serializers.ModelSerializer):
    process_code = serializers.CharField(source="process.code", read_only=True)
    based_on_label = serializers.SerializerMethodField()

    class Meta:
        model = ProcessVersion
        fields = [
            "id",
            "process",
            "process_code",
            "kind",
            "version",
            "status",
            "note",
            "based_on",
            "based_on_label",
            "approved_by",
            "approved_at",
            "created_at",
            "updated_at",
        ]

    def get_based_on_label(self, obj) -> str | None:
        return f"{obj.based_on.kind} v{obj.based_on.version}" if obj.based_on else None


class ProcessVersionDetailSerializer(ProcessVersionListSerializer):
    class Meta(ProcessVersionListSerializer.Meta):
        fields = ProcessVersionListSerializer.Meta.fields + ["bpmn_xml"]


class BpmnSaveSerializer(serializers.Serializer):
    bpmn_xml = serializers.CharField(max_length=2 * 1024 * 1024, trim_whitespace=False)


class NewDraftSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True)


class ActivitySerializer(serializers.ModelSerializer):
    process_code = serializers.CharField(source="process.code", read_only=True)
    automation_locked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id",
            "process",
            "process_code",
            "task_id",
            "name",
            "bpmn_type",
            "lane",
            "parent_task",
            "parent_name",
            "order",
            "system",
            "automation",
            "automation_locked",
            "traceable",
            "steps",
            "data_in",
            "data_out",
            "in_current_model",
        ]
        # identity comes from the BPMN model and is not editable here
        read_only_fields = [
            "id",
            "process",
            "task_id",
            "name",
            "bpmn_type",
            "lane",
            "parent_task",
            "parent_name",
            "order",
            "in_current_model",
        ]

    def validate(self, attrs):
        forced = Activity.FORCED_AUTOMATION.get(self.instance.bpmn_type) if self.instance else None
        if forced and attrs.get("automation") and attrs["automation"] != forced:
            raise serializers.ValidationError(
                {"automation": f"A BPMN {self.instance.bpmn_type} is always {forced}. Change the task type in the model instead."}
            )
        return attrs


class LaneSerializer(serializers.ModelSerializer):
    sub_job_family_name = serializers.CharField(source="sub_job_family.name", read_only=True, default=None)
    job_family = serializers.CharField(source="sub_job_family.job_family_id", read_only=True, default=None)
    job_family_name = serializers.CharField(source="sub_job_family.job_family.name", read_only=True, default=None)
    activity_count = serializers.SerializerMethodField()

    class Meta:
        model = Lane
        fields = [
            "id",
            "process",
            "name",
            "sub_job_family",
            "sub_job_family_name",
            "job_family",
            "job_family_name",
            "is_external",
            "order",
            "activity_count",
        ]
        read_only_fields = ["id", "process", "name", "order"]

    def get_activity_count(self, obj) -> int:
        return obj.process.activities.filter(lane=obj.name, in_current_model=True).count()

    def validate(self, attrs):
        external = attrs.get("is_external", getattr(self.instance, "is_external", False))
        if external and attrs.get("sub_job_family"):
            raise serializers.ValidationError("An external lane cannot map to an internal sub job family.")
        return attrs


class RiskSerializer(serializers.ModelSerializer):
    rating = serializers.IntegerField(read_only=True)

    class Meta:
        model = Risk
        fields = [
            "id",
            "process",
            "risk_id",
            "title",
            "step",
            "owner",
            "likelihood",
            "impact",
            "rating",
            "control",
            "control_type",
            "status",
        ]


class ProcessDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProcessDocument
        fields = ["id", "process", "doc_id", "title", "doc_type", "version", "url", "step", "owner"]

    def validate_url(self, value):
        if value and not value.startswith("https://"):
            raise serializers.ValidationError("Only https:// links are allowed.")
        return value
