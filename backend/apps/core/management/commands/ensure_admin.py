"""
Create (or reset the password of) the platform administrator from environment variables —
useful on hosts without a shell (e.g. Render free plan).

    XCORE_ADMIN_USERNAME=admin XCORE_ADMIN_PASSWORD=... python manage.py ensure_admin
"""

import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Create the administrator from XCORE_ADMIN_USERNAME / XCORE_ADMIN_PASSWORD (no-op if unset)."

    def handle(self, *args, **opts):
        username = os.environ.get("XCORE_ADMIN_USERNAME", "").strip()
        password = os.environ.get("XCORE_ADMIN_PASSWORD", "")
        if not username or not password:
            self.stdout.write("XCORE_ADMIN_USERNAME / XCORE_ADMIN_PASSWORD not set — skipping.")
            return
        User = get_user_model()
        user = User.objects.filter(username=username).first() or User(username=username)
        try:
            validate_password(password, user)
        except Exception as exc:  # noqa: BLE001
            raise CommandError(f"XCORE_ADMIN_PASSWORD is too weak: {'; '.join(getattr(exc, 'messages', [str(exc)]))}") from exc
        created = user.pk is None
        user.role = "admin"
        user.display_name = user.display_name or "Platform administrator"
        user.is_staff = user.is_superuser = user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Administrator {'created' if created else 'updated'}: {username}"))
