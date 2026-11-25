from django.db import IntegrityError, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Employee
from .serializers import EmployeeSerializer


class EmployeeListView(APIView):
    def get(self, request):
        """GET /api/employees"""
        employees = Employee.objects.order_by("id")
        return Response(EmployeeSerializer(employees, many=True).data)

    def post(self, request):
        serializer = EmployeeSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        email = serializer.validated_data["email"]
        conflict = Response(
            {"errors": {"email": ["Email is already in use."]}}, status=status.HTTP_409_CONFLICT
        )
        if Employee.objects.filter(email__iexact=email).exists():
            return conflict
        try:
            with transaction.atomic():
                employee = serializer.save()
        except IntegrityError:
            return conflict
        return Response(
            EmployeeSerializer(employee).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/employees/{employee.pk}"},
        )


class EmployeeDetailView(APIView):
    def get(self, request, pk):
        employee = Employee.objects.filter(pk=pk).first()
        if employee is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(EmployeeSerializer(employee).data)
