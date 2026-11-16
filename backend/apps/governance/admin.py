from django.contrib import admin

from .models import ApprovalRequest


@admin.register(ApprovalRequest)
class ApprovalRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "entity_type", "status", "submitted_label", "decided_label")
    list_filter = ("status", "entity_type")
    readonly_fields = [f.name for f in ApprovalRequest._meta.fields]
