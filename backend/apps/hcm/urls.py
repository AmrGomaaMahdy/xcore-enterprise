from rest_framework.routers import DefaultRouter

from .views import BusinessUnitViewSet, EmployeeViewSet, JobFamilyViewSet, JobViewSet, SubJobFamilyViewSet

router = DefaultRouter()
router.register("business-units", BusinessUnitViewSet)
router.register("job-families", JobFamilyViewSet)
router.register("sub-job-families", SubJobFamilyViewSet)
router.register("jobs", JobViewSet)
router.register("employees", EmployeeViewSet)
urlpatterns = router.urls
