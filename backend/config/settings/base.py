"""
Base settings shared by every environment.

All secrets and environment-specific values come from environment variables
(12-factor). Nothing sensitive is hard-coded here.
"""

from __future__ import annotations

import os
from datetime import timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env(name: str, default: str | None = None) -> str | None:
    return os.environ.get(name, default)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def env_list(name: str, default: str = "") -> list[str]:
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8080,http://localhost:5173")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third party
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "axes",
    # X-Core
    "apps.core",
    "apps.accounts",
    "apps.hcm",
    "apps.processes",
    "apps.kpis",
    "apps.catalog",
    "apps.governance",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.core.middleware.RequestIdMiddleware",
    # django-axes must be last: it inspects failed logins and locks out brute force attempts
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

# ---------------------------------------------------------------- database
if env("DB_ENGINE", "postgres") == "sqlite":
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB", "xcore"),
            "USER": env("POSTGRES_USER", "xcore"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "db"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": int(env("DB_CONN_MAX_AGE", "60") or 60),
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {"sslmode": env("POSTGRES_SSLMODE", "prefer")},
        }
    }
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- authentication
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Brute-force protection (django-axes): 5 failures per username + IP -> 15 minute lock-out
AXES_FAILURE_LIMIT = int(env("AXES_FAILURE_LIMIT", "5") or 5)
AXES_COOLOFF_TIME = timedelta(minutes=int(env("AXES_COOLOFF_MINUTES", "15") or 15))
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True
AXES_CLIENT_IP_CALLABLE = "apps.core.net.client_ip"

# ---------------------------------------------------------------- sessions & CSRF (same-origin SPA)
SESSION_COOKIE_NAME = "xcore_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = int(env("SESSION_COOKIE_AGE", str(8 * 60 * 60)) or 28800)
SESSION_SAVE_EVERY_REQUEST = True  # sliding expiry
CSRF_COOKIE_NAME = "xcore_csrftoken"
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it and returns it in the X-CSRFToken header
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"

# ---------------------------------------------------------------- security headers
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # BPMN models up to 5 MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = 2000

# ---------------------------------------------------------------- i18n / static
LANGUAGE_CODE = "en-us"
TIME_ZONE = env("DJANGO_TIME_ZONE", "Asia/Riyadh")
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# ---------------------------------------------------------------- REST framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.core.permissions.IsEditorOrReadOnly"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.OptionalPageNumberPagination",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", "60/min"),
        "user": env("THROTTLE_USER", "1200/min"),
        "login": env("THROTTLE_LOGIN", "10/min"),
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}
SPECTACULAR_SETTINGS = {
    "TITLE": "X-Core Process Hub API",
    "DESCRIPTION": "Business Process Library, Enterprise KPI Library, KPI Alignment Matrix, Service Catalog, Impact Analysis and Approvals.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "ENUM_NAME_OVERRIDES": {
        "ProcessVersionStatusEnum": "apps.processes.models.ProcessVersion.Status",
        "KpiTargetStatusEnum": "apps.kpis.models.KpiTarget.Status",
        "ProcessNodeStatusEnum": "apps.processes.models.ProcessNode.Status",
        "RiskStatusEnum": "apps.processes.models.Risk.Status",
        "ApprovalStatusEnum": "apps.governance.models.ApprovalRequest.Status",
    },
    "SERVE_PERMISSIONS": ["rest_framework.permissions.IsAuthenticated"],
}

# ---------------------------------------------------------------- logging (structured, to stdout)
LOG_LEVEL = env("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s", "defaults": {"request_id": "-"}},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "axes": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}

# ---------------------------------------------------------------- X-Core domain settings
XCORE = {
    "TRUST_PROXY_HEADER": env_bool("XCORE_TRUST_PROXY_HEADER", True),
    "HCM_SYNC_LABEL": env("XCORE_HCM_SYNC_LABEL", "Oracle Fusion HCM · nightly 02:00"),
    # segregation-of-duties rules: two activities must not be performed by the same sub job family
    "SOD_RULES": [
        {"a": "T-030-02", "b": "T-030-16", "why": "Release PO vs 3-way match before payment"},
        {"a": "T-030-02", "b": "T-030-15", "why": "Release PO vs confirm received quantity"},
        {"a": "T-028-03", "b": "T-028-05", "why": "Issue RFx vs technical evaluation"},
    ],
}
ADMIN_URL = env("DJANGO_ADMIN_URL", "admin/")
