"""Test identities for the sandbox: fixed bearer tokens mapped to users.

There is no real identity provider and there are no real credentials. Tokens
are case-sensitive.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Identity:
    """A user of the expense system. Roles: "employee" or "admin"."""

    username: str
    role: str

    # Django REST Framework permission classes such as IsAuthenticated check this.
    is_authenticated = True

    @property
    def is_admin(self):
        return self.role == "admin"


_BY_TOKEN = {
    "test-token-alice": Identity("alice", "employee"),
    "test-token-bob": Identity("bob", "employee"),
    "test-token-admin": Identity("admin", "admin"),
}


def find_by_token(token):
    """The user a token belongs to, or None for an unknown token."""
    return _BY_TOKEN.get(token)
