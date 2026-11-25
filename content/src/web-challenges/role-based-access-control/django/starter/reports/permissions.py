from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """TODO: only admins (request.user.is_admin) may pass."""

    def has_permission(self, request, view):
        return True
