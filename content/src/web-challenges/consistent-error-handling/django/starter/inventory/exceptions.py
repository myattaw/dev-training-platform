"""Central error handling: Django REST Framework calls api_exception_handler
for every exception raised in a view (see REST_FRAMEWORK in config/settings.py).

TODO: every error response must use the documented format
{"error": {"code": "...", "message": "..."}} (plus "fields" for
validation_failed). Map NotFoundError, ConflictError and InvalidInputError
(errors.py), answer a request body that cannot be read (DRF's ParseError) with
validation_failed, keep the status of DRF's other client errors, and answer
anything else with 500 "internal" and a generic message, logging the details
on the server only. Returning None lets Django answer with its own 500 page.
"""
import traceback

from rest_framework.response import Response


def api_exception_handler(exc, context):
    # Temporary: added while debugging. It answers 500 for every error and
    # shows the exception's message, type and traceback to any client.
    return Response(
        {
            "error": str(exc),
            "exception": type(exc).__name__,
            "traceback": traceback.format_exception(exc),
        },
        status=500,
    )
