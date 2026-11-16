from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AdoptView, GeneratorView, ServiceViewSet

router = DefaultRouter()
router.register("services", ServiceViewSet)
urlpatterns = [
    path("generator/", GeneratorView.as_view(), name="service-generator"),
    path("generator/<str:code>/adopt/", AdoptView.as_view(), name="service-adopt"),
] + router.urls
