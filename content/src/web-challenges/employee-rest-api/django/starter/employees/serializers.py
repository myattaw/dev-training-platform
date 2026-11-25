from rest_framework import serializers

from .models import DEPARTMENTS, Employee


class EmployeeSerializer(serializers.ModelSerializer):
    """Reads and validates employees.

    TODO: trim the fields, validate the email (one "@" with text on both
    sides, no spaces) and the department (one of DEPARTMENTS), and store the
    email in lower case. Leave the duplicate-email check to the view, which
    must answer 409 for it.
    """

    class Meta:
        model = Employee
        fields = ["id", "name", "email", "department"]
