from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UserAccount
from .passwords import hash_password
from .serializers import RegisterRequestSerializer, RegistrationSerializer


class RegistrationListView(APIView):
    def post(self, request):
        serializer = RegisterRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        conflict = Response(
            {"errors": {"email": ["This email address is already registered."]}},
            status=status.HTTP_409_CONFLICT,
        )
        if UserAccount.objects.filter(email__iexact=data["email"]).exists():
            return conflict
        try:
            with transaction.atomic():
                account = UserAccount.objects.create(
                    email=data["email"],
                    display_name=data["display_name"],
                    password_hash=hash_password(data["password"]),
                )
        except IntegrityError:
            return conflict
        return Response(
            RegistrationSerializer(account).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/registrations/{account.pk}"},
        )


class RegistrationDetailView(APIView):
    def get(self, request, pk):
        """GET /api/registrations/<id>"""
        account = UserAccount.objects.filter(pk=pk).first()
        if account is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(RegistrationSerializer(account).data)
