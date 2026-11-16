from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.views import HealthView, OverviewView

api = [
    path("health/", HealthView.as_view(), name="health"),
    path("overview/", OverviewView.as_view(), name="overview"),
    path("auth/", include("apps.accounts.urls")),
    path("hcm/", include("apps.hcm.urls")),
    path("processes/", include("apps.processes.urls")),
    path("kpis/", include("apps.kpis.urls")),
    path("catalog/", include("apps.catalog.urls")),
    path("governance/", include("apps.governance.urls")),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path(settings.ADMIN_URL if hasattr(settings, "ADMIN_URL") else "admin/", admin.site.urls),
    path("api/v1/", include(api)),
]
