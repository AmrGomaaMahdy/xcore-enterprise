from rest_framework import serializers

from .models import User


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, trim_whitespace=True)
    password = serializers.CharField(max_length=256, trim_whitespace=False, write_only=True, style={"input_type": "password"})


class MeSerializer(serializers.ModelSerializer):
    can_edit = serializers.BooleanField(read_only=True)
    can_approve = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "display_name", "email", "role", "job_title", "business_unit", "can_edit", "can_approve"]
        read_only_fields = fields
