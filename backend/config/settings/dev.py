"""Local development: DEBUG on, permissive hosts, insecure secret only if none is provided."""

from .base import *  # noqa: F403
from .base import env

DEBUG = True
SECRET_KEY = env("DJANGO_SECRET_KEY") or "dev-only-insecure-key-change-me-0123456789abcdef"
ALLOWED_HOSTS = ["*"]
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [  # noqa: F405
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]
