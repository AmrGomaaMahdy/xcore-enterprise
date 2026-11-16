from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ApprovalRequestViewSet, AuditViewSet, ImpactView

router = DefaultRouter()
router.register("approvals", ApprovalRequestViewSet)
router.register("audit", AuditViewSet)
urlpatterns = [path("impact/", ImpactView.as_view(), name="impact")] + router.urls
