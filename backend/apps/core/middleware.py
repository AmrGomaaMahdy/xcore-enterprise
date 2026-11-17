import logging
import uuid

_log_record_factory = logging.getLogRecordFactory()


class RequestIdMiddleware:
    """Adds an X-Request-ID to every response (correlates frontend errors with server logs)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        rid = request.headers.get("X-Request-ID", "")
        if not rid or len(rid) > 64 or not rid.replace("-", "").isalnum():
            rid = uuid.uuid4().hex
        request.request_id = rid
        response = self.get_response(request)
        response["X-Request-ID"] = rid
        return response


class SecurityHeadersMiddleware:
    """
    Adds the browser security headers nginx adds in the Docker Compose setup, so the same protection
    applies when Django serves the app directly (Render single-service deployment).
    The Swagger UI loads assets from a CDN, so it is excluded from the strict CSP.
    """

    EXEMPT = ("/api/v1/docs/",)

    def __init__(self, get_response):
        from django.conf import settings

        self.get_response = get_response
        self.csp = settings.XCORE.get("CSP", "")

    def __call__(self, request):
        response = self.get_response(request)
        if self.csp and not request.path.startswith(self.EXEMPT):
            response.headers.setdefault("Content-Security-Policy", self.csp)
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
        return response


class HealthCheckMiddleware:
    """
    Answers the platform health probe before host validation and HTTPS redirects, because load
    balancers (Render, Docker) call it with an internal Host header and over plain HTTP.
    Reveals nothing but ok / unavailable.
    """

    PATH = "/api/v1/health/"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path_info != self.PATH or request.method not in ("GET", "HEAD"):
            return self.get_response(request)
        from django.db import connection
        from django.http import JsonResponse

        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            return JsonResponse({"status": "ok"})
        except Exception:  # noqa: BLE001 — never leak DB errors
            return JsonResponse({"status": "unavailable"}, status=503)
