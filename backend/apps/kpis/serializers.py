from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import Kpi, KpiLink, KpiTarget, StrategicObjective


def _run_clean(instance):
    try:
        instance.clean()
    except DjangoValidationError as exc:
        raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages) from exc


class StrategicObjectiveSerializer(serializers.ModelSerializer):
    class Meta:
        model = StrategicObjective
        fields = ["code", "name", "description", "is_outcome", "order"]


class KpiLinkSerializer(serializers.ModelSerializer):
    parent = serializers.SlugRelatedField(slug_field="kpi_id", queryset=Kpi.objects.all())
    child = serializers.SlugRelatedField(slug_field="kpi_id", queryset=Kpi.objects.all())

    class Meta:
        model = KpiLink
        fields = ["id", "parent", "child", "relation", "weight"]

    def validate(self, attrs):
        if attrs["parent"] == attrs["child"]:
            raise serializers.ValidationError("A KPI cannot link to itself.")
        if attrs["relation"] == KpiLink.Relation.ROLLS_UP and attrs["child"].level <= attrs["parent"].level:
            raise serializers.ValidationError("Roll-ups go from a lower tier into a higher tier.")
        return attrs


class KpiTargetSerializer(serializers.ModelSerializer):
    kpi = serializers.SlugRelatedField(slug_field="kpi_id", queryset=Kpi.objects.all())

    class Meta:
        model = KpiTarget
        fields = [
            "id",
            "target_id",
            "kpi",
            "scope",
            "period",
            "green",
            "amber",
            "reason",
            "status",
            "approved_by",
            "approved_at",
            "updated_at",
        ]
        read_only_fields = ["status", "approved_by", "approved_at", "updated_at"]

    def validate(self, attrs):
        if self.instance and self.instance.status != KpiTarget.Status.DRAFT:
            raise serializers.ValidationError("Only Draft targets can be edited; propose a new target instead.")
        _run_clean(
            KpiTarget(
                **{
                    **({f: getattr(self.instance, f) for f in ["kpi", "green", "amber"]} if self.instance else {}),
                    **{k: v for k, v in attrs.items() if k in {"kpi", "green", "amber"}},
                }
            )
        )
        return attrs


class KpiSerializer(serializers.ModelSerializer):
    node_code = serializers.CharField(source="node.code", read_only=True)
    node_name = serializers.CharField(source="node.name", read_only=True)
    domain = serializers.SerializerMethodField()
    tier = serializers.CharField(read_only=True)
    rolls_up = serializers.SerializerMethodField()
    explained_by = serializers.SerializerMethodField()
    used_by = serializers.SerializerMethodField()
    target = serializers.SerializerMethodField()

    class Meta:
        model = Kpi
        fields = [
            "id",
            "kpi_id",
            "node",
            "node_code",
            "node_name",
            "domain",
            "level",
            "tier",
            "name",
            "definition",
            "unit",
            "direction",
            "calc_type",
            "formula",
            "source",
            "owner",
            "from_task",
            "to_task",
            "measure_process",
            "objective",
            "is_outcome",
            "key",
            "actual",
            "baseline",
            "actual_period",
            "rolls_up",
            "explained_by",
            "used_by",
            "target",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at", "actual", "baseline", "actual_period"]

    def get_domain(self, obj) -> str:
        return obj.node.domain_code()

    def get_rolls_up(self, obj) -> list[dict]:
        return [
            {"kpi_id": lk.child.kpi_id, "weight": lk.weight} for lk in obj.child_links.all() if lk.relation == KpiLink.Relation.ROLLS_UP
        ]

    def get_explained_by(self, obj) -> list[str]:
        return [lk.child.kpi_id for lk in obj.child_links.all() if lk.relation == KpiLink.Relation.EXPLAINS]

    def get_used_by(self, obj) -> list[dict]:
        return [{"kpi_id": lk.parent.kpi_id, "relation": lk.relation} for lk in obj.parent_links.all()]

    def get_target(self, obj) -> dict | None:
        active = [t for t in obj.targets.all() if t.status == KpiTarget.Status.ACTIVE and t.scope == "Company"]
        t = sorted(active, key=lambda x: x.period)[-1] if active else None
        return {"target_id": t.target_id, "period": t.period, "green": t.green, "amber": t.amber} if t else None

    def validate(self, attrs):
        merged = {f.name: getattr(self.instance, f.name) for f in Kpi._meta.concrete_fields} if self.instance else {}
        merged.update(attrs)
        merged.pop("id", None)
        _run_clean(Kpi(**{k: v for k, v in merged.items() if k not in {"created_by", "updated_by", "created_at", "updated_at"}}))
        return attrs


class WeightsSerializer(serializers.Serializer):
    weights = serializers.DictField(
        child=serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("100")), allow_empty=False
    )
