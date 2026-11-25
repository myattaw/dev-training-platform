from rest_framework import serializers

from .models import UserAccount


class RegistrationSerializer(serializers.ModelSerializer):
    """The public view of an account: id, email and displayName. Never the password."""

    displayName = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = UserAccount
        fields = ["id", "email", "displayName"]
        read_only_fields = ["id", "email"]


class RegisterRequestSerializer(serializers.Serializer):
    """Validates the body of POST /api/registrations.

    TODO: accept email, displayName, password, confirmPassword and acceptTerms;
    trim the email and display name and lower-case the email; apply every rule
    and report EVERY invalid field at once (DRF skips validate() when a field
    fails its own validation, so plan where each check lives). Leave the
    duplicate-email check to the view, which must answer 409 for it.
    """
