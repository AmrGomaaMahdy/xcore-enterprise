from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AlignmentView, CascadeView, KpiLinkViewSet, KpiTargetViewSet, KpiViewSet, StrategicObjectiveViewSet

router = DefaultRouter()
router.register("objectives", StrategicObjectiveViewSet)
router.register("library", KpiViewSet, basename="kpi")
router.register("links", KpiLinkViewSet)
router.register("targets", KpiTargetViewSet)
urlpatterns = [
    path("alignment/", AlignmentView.as_view(), name="kpi-alignment"),
    path("cascade/", CascadeView.as_view(), name="kpi-cascade"),
] + router.urls
