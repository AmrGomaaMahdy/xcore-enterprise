"""Client IP resolution behind a reverse proxy (nginx in Docker Compose, the Render edge in the cloud)."""

from django.conf import settings


def client_ip(request) -> str | None:
    """
    1. X-Real-IP — set (overwritten) by the bundled nginx.
    2. X-Forwarded-For — the entry appended by the trusted proxy, i.e. PROXY_COUNT from the right;
       entries further left can be forged by the client.
    Set XCORE_TRUST_PROXY_HEADER=false when the API is reachable without a proxy.
    """
    meta = request.META
    if settings.XCORE.get("TRUST_PROXY_HEADER", True):
        real = meta.get("HTTP_X_REAL_IP", "").strip()
        if real:
            return real[:64]
        chain = [p.strip() for p in meta.get("HTTP_X_FORWARDED_FOR", "").split(",") if p.strip()]
        count = max(1, int(settings.XCORE.get("PROXY_COUNT", 1)))
        if len(chain) >= count:
            return chain[-count][:64]
    return meta.get("REMOTE_ADDR")
