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
