"""Consistent error envelope: {"error": {"code", "message", "details"}} — never leaks stack traces."""

import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import exception_handler

log = logging.getLogger(__name__)


class DomainError(Exception):
    """A business rule was violated (e.g. maker-checker, weights not adding up to 100%)."""

    def __init__(self, message: str, code: str = "rule_violation", details=None):
        super().__init__(message)
        self.message, self.code, self.details = message, code, details or {}


def api_exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response({"error": {"code": exc.code, "message": exc.message, "details": exc.details}}, status=status.HTTP_409_CONFLICT)
    if isinstance(exc, DjangoValidationError):
        exc = ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
    response = exception_handler(exc, context)
    if response is None:
        log.exception("Unhandled API error", exc_info=exc)
        return Response({"error": {"code": "server_error", "message": "Unexpected error. The incident was logged."}}, status=500)
    data = response.data
    message = data.get("detail") if isinstance(data, dict) and "detail" in data else "Please check the highlighted fields."
    code = getattr(getattr(exc, "detail", None), "code", None) or getattr(exc, "default_code", "error")
    response.data = {
        "error": {
            "code": str(code),
            "message": str(message),
            "details": data if not (isinstance(data, dict) and set(data) == {"detail"}) else {},
        }
    }
    return response
