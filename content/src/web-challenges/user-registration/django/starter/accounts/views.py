from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserAccount
from .passwords import hash_password
from .serializers import RegisterRequestSerializer, RegistrationSerializer


class RegistrationListView(APIView):
    def post(self, request):
        """TODO: POST /api/registrations: 201 with a Location header and the new
        account (id, email, displayName: never the password), 400 with
        {"errors": {field: [messages]}} listing every invalid field, 409 when
        the email address is already registered. Store hash_password(password),
        never the password itself."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)


class RegistrationDetailView(APIView):
    def get(self, request, pk):
        """GET /api/registrations/<id>"""
        account = UserAccount.objects.filter(pk=pk).first()
        if account is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RegistrationSerializer(account).data)
