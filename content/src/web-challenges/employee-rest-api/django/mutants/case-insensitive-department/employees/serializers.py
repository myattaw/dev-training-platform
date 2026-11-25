from rest_framework import serializers

from .models import DEPARTMENTS, Employee


class EmployeeSerializer(serializers.ModelSerializer):
    """Reads and validates employees. Duplicate emails are checked by the view (409)."""

    # Declared explicitly so the model's unique constraint does not add its own
    # validator (that would answer 400 instead of 409 for a duplicate).
    email = serializers.CharField(max_length=254)

    class Meta:
        model = Employee
        fields = ["id", "name", "email", "department"]

    def validate_name(self, value):
        value = value.strip()
        if not 1 <= len(value) <= 100:
            raise serializers.ValidationError("Name is required (1-100 characters).")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        at = value.find("@")
        if at <= 0 or at != value.rfind("@") or at == len(value) - 1 or " " in value:
            raise serializers.ValidationError("Email must look like name@example.com.")
        return value

    def validate_department(self, value):
        value = value.strip().capitalize()
        if value not in DEPARTMENTS:
            raise serializers.ValidationError(f"Department must be one of {', '.join(DEPARTMENTS)}.")
        return value
