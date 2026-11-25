from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from .identity import find_by_token


class BearerTokenAuthentication(BaseAuthentication):
    """Authenticates requests from their `Authorization: Bearer <token>` header."""

    def authenticate(self, request):
        header = request.META.get("HTTP_AUTHORIZATION")
        if header is None:
            return None  # anonymous: IsAuthenticated turns this into 401
        # "<scheme> <token>": the scheme is case-insensitive, the token is not.
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            raise AuthenticationFailed("Use the Authorization header: Bearer <token>.")
        user = find_by_token(token)
        if user is None:
            raise AuthenticationFailed("Unknown token.")
        return (user, token)

    def authenticate_header(self, request):
        # Without a WWW-Authenticate value, DRF answers 403 instead of 401 for
        # unauthenticated requests.
        return "Bearer"
