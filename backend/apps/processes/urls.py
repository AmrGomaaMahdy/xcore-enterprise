from rest_framework.routers import DefaultRouter

from .views import (
    ActivityViewSet,
    LaneViewSet,
    ProcessDocumentViewSet,
    ProcessNodeViewSet,
    ProcessVersionViewSet,
    RiskViewSet,
    SearchViewSet,
)

router = DefaultRouter()
router.register("nodes", ProcessNodeViewSet)
router.register("versions", ProcessVersionViewSet)
router.register("activities", ActivityViewSet, basename="activity")
router.register("lanes", LaneViewSet)
router.register("risks", RiskViewSet)
router.register("documents", ProcessDocumentViewSet)
router.register("search", SearchViewSet, basename="search")
urlpatterns = router.urls
