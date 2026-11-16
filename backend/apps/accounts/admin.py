from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class XCoreUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("X-Core", {"fields": ("role", "display_name", "job_title", "business_unit")}),)
    list_display = ("username", "display_name", "role", "is_active", "last_login")
    list_filter = ("role", "is_active", "is_superuser")
