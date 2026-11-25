from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Only admins may pass (use after IsAuthenticated)."""

    message = "Only admins can approve reports."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_admin)
