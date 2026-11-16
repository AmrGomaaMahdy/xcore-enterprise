from rest_framework import serializers

from apps.core.models import AuditEntry

from .models import ApprovalRequest


class ApprovalRequestSerializer(serializers.ModelSerializer):
    can_decide = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalRequest
        fields = [
            "id",
            "entity_type",
            "entity_pk",
            "entity_label",
            "process_code",
            "title",
            "summary",
            "status",
            "submitted_label",
            "submitted_at",
            "submit_comment",
            "decided_label",
            "decided_at",
            "decision_comment",
            "can_decide",
        ]
        read_only_fields = fields

    def get_can_decide(self, obj) -> bool:
        user = self.context["request"].user
        from apps.core.permissions import can_approve

        return obj.status == "pending" and can_approve(user) and obj.submitted_by_id != user.pk


class DecisionSerializer(serializers.Serializer):
    comment = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class AuditEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEntry
        fields = ["id", "at", "actor_label", "action", "entity_type", "entity_id", "process_code", "summary", "changes"]
