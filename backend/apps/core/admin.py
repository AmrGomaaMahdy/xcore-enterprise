from django.contrib import admin

from .models import AuditEntry


@admin.register(AuditEntry)
class AuditEntryAdmin(admin.ModelAdmin):
    list_display = ("at", "actor_label", "action", "entity_type", "entity_id", "process_code", "summary")
    list_filter = ("action", "entity_type")
    search_fields = ("summary", "entity_id", "process_code", "actor_label")

    def has_change_permission(self, request, obj=None):  # the audit trail is append-only
        return False

    def has_delete_permission(self, request, obj=None):
        return False
