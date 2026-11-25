from rest_framework.authentication import BaseAuthentication

from .identity import find_by_token


class BearerTokenAuthentication(BaseAuthentication):
    """Authenticates requests from their `Authorization: Bearer <token>` header."""

    def authenticate(self, request):
        """TODO: read the Authorization header (request.META["HTTP_AUTHORIZATION"]):
        the scheme "Bearer" (any letter case), one space, then the token
        (case-sensitive). Look the token up with find_by_token.

        Return None when there is no header (the request is anonymous), raise
        AuthenticationFailed for another scheme, a missing token or an unknown
        token, and return (user, token) otherwise.

        Unauthenticated requests must get 401 with `WWW-Authenticate: Bearer`:
        see how DRF decides between 401 and 403."""
        _ = find_by_token
        return None
