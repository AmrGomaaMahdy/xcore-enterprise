from django.contrib import admin

from .models import Kpi, KpiLink, KpiTarget, StrategicObjective


@admin.register(Kpi)
class KpiAdmin(admin.ModelAdmin):
    list_display = ("kpi_id", "name", "level", "calc_type", "objective")
    list_filter = ("level", "calc_type")
    search_fields = ("kpi_id", "name")


admin.site.register([StrategicObjective, KpiLink, KpiTarget])
