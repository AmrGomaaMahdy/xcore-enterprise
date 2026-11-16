"""Production: secure cookies, HSTS, strict hosts. Fails fast when the secret key is missing."""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import SECRET_KEY, env, env_bool

if not SECRET_KEY or len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be set to a random value of at least 50 characters.")

DEBUG = False
SESSION_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
CSRF_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", False)  # TLS usually terminates at the load balancer
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = int(env("DJANGO_HSTS_SECONDS", "31536000") or 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env_bool("DJANGO_HSTS_PRELOAD", False)
