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
        """TODO: POST /api/employees: 201 with a Location header and the new
        employee, 400 with {"errors": {field: [messages]}} for invalid input,
        409 when the email address is already in use."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)


class EmployeeDetailView(APIView):
    def get(self, request, pk):
        """TODO: GET /api/employees/<id>: 200 with the employee, or 404."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)
