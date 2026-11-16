"""Test settings: in-memory SQLite and a fast password hasher."""

from .base import *  # noqa: F403

SECRET_KEY = "test-secret-key-not-for-production-0123456789abcdefghijklmnop"
DEBUG = False
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
REST_FRAMEWORK["DEFAULT_THROTTLE_CLASSES"] = []  # noqa: F405
AXES_ENABLED = False
STORAGES["staticfiles"] = {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}  # noqa: F405
