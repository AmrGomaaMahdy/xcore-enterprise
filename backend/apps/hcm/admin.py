from django.contrib import admin

from .models import BusinessUnit, Employee, Job, JobFamily, SubJobFamily

admin.site.register([BusinessUnit, JobFamily, SubJobFamily, Job, Employee])
