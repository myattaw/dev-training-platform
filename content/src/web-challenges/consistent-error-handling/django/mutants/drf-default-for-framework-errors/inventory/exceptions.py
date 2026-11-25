"""Central error handling: Django REST Framework calls api_exception_handler
for every exception raised in a view (see REST_FRAMEWORK in config/settings.py)."""
import logging

from django.http import Http404
from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler

from .errors import ConflictError, InvalidInputError, NotFoundError

logger = logging.getLogger(__name__)


def _error(status, code, message, fields=None):
    error = {"code": code, "message": message}
    if fields is not None:
        error["fields"] = fields
    return Response({"error": error}, status=status)


def api_exception_handler(exc, context):
    if isinstance(exc, InvalidInputError):
        return _error(400, "validation_failed", str(exc), exc.fields)
    if isinstance(exc, NotFoundError):
        return _error(404, "not_found", str(exc))
    if isinstance(exc, ConflictError):
        return _error(409, "conflict", str(exc))
    response = exception_handler(exc, context)  # DRF default for its own errors
    if response is not None:
        return response
    # The details stay in the server log; the client gets a generic message.
    view = context.get("view")
    logger.error("Unhandled exception in %s", type(view).__name__, exc_info=exc)
    return _error(500, "internal", "An unexpected error occurred.")
