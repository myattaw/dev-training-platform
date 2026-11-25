"""Errors the services raise on purpose.

Their messages are written for API clients and are safe to return. Any other
exception is unexpected: its message and details are internal and must never
reach a client.
"""


class NotFoundError(Exception):
    """The requested item does not exist (404, code not_found)."""


class ConflictError(Exception):
    """The request conflicts with the current state, e.g. not enough stock (409, code conflict)."""


class InvalidInputError(Exception):
    """Invalid input (400, code validation_failed). fields maps field name to messages."""

    def __init__(self, fields):
        super().__init__("One or more fields are invalid.")
        self.fields = fields
