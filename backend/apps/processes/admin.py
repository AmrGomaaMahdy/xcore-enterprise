from django.contrib import admin

from .models import Activity, Lane, ProcessDocument, ProcessNode, ProcessVersion, Risk


@admin.register(ProcessNode)
class ProcessNodeAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "level", "parent", "status")
    list_filter = ("level", "status")
    search_fields = ("code", "name")


@admin.register(ProcessVersion)
class ProcessVersionAdmin(admin.ModelAdmin):
    list_display = ("process", "kind", "version", "status", "approved_at")
    list_filter = ("kind", "status")


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("task_id", "name", "process", "lane", "automation", "traceable", "in_current_model")
    list_filter = ("automation", "traceable", "in_current_model")
    search_fields = ("task_id", "name")


admin.site.register([Lane, Risk, ProcessDocument])
