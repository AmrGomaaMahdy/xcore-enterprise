"""Client IP resolution behind the bundled nginx reverse proxy."""

from django.conf import settings


def client_ip(request) -> str | None:
    """
    nginx overwrites X-Real-IP with the real peer address, and the API container is reachable only
    through nginx (internal compose network). Set XCORE_TRUST_PROXY_HEADER=false when the API is
    exposed directly, so a client cannot spoof the header.
    """
    if settings.XCORE.get("TRUST_PROXY_HEADER", True):
        forwarded = request.META.get("HTTP_X_REAL_IP", "").strip()
        if forwarded:
            return forwarded[:64]
    return request.META.get("REMOTE_ADDR")
