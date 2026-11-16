from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Platform user. Business data about employees lives in HCM; this is only the login identity."""

    class Role(models.TextChoices):
        VIEWER = "viewer", "Viewer"
        EDITOR = "editor", "Editor"
        APPROVER = "approver", "Approver"
        ADMIN = "admin", "Administrator"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    display_name = models.CharField(max_length=150, blank=True)
    job_title = models.CharField(max_length=150, blank=True)
    business_unit = models.CharField(max_length=60, blank=True)

    @property
    def can_edit(self) -> bool:
        return self.is_superuser or self.role in {self.Role.EDITOR, self.Role.APPROVER, self.Role.ADMIN}

    @property
    def can_approve(self) -> bool:
        return self.is_superuser or self.role in {self.Role.APPROVER, self.Role.ADMIN}

    def __str__(self) -> str:
        return self.display_name or self.username
