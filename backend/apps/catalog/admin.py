from django.contrib import admin

from .models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("service_id", "name", "process", "status", "owner")
    list_filter = ("status", "category")
