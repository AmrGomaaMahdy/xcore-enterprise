"""Serve the React single-page app's index.html for client-side routes (single-service mode)."""

from pathlib import Path

from django.conf import settings
from django.http import Http404, HttpResponse
from django.views.decorators.http import require_safe


@require_safe
def spa_index(request, path: str = ""):
    index = Path(settings.SPA_DIR or "") / "index.html"
    if not settings.SPA_DIR or not index.is_file():
        raise Http404("Frontend not bundled with this deployment.")
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-store"
    return response
