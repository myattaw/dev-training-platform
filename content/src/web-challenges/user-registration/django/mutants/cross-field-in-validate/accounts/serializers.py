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
    """Field rules in validate_<field>, cross-field rules in validate()."""

    email = serializers.CharField(allow_blank=True)
    displayName = serializers.CharField(allow_blank=True, trim_whitespace=False)
    password = serializers.CharField(allow_blank=True, trim_whitespace=False, write_only=True)
    confirmPassword = serializers.CharField(allow_blank=True, trim_whitespace=False, write_only=True)
    acceptTerms = serializers.BooleanField()

    def validate_email(self, value):
        value = value.strip().lower()
        if not is_email(value):
            raise serializers.ValidationError("Enter an email address like name@example.com.")
        return value

    def validate_displayName(self, value):
        value = value.strip()
        if not 2 <= len(value) <= 40:
            raise serializers.ValidationError("Display name must be 2-40 characters.")
        return value

    def validate_password(self, value):
        errors = []
        if len(value) < 12:
            errors.append("Password must be at least 12 characters.")
        if not any("A" <= c <= "Z" for c in value):
            errors.append("Password needs an upper-case letter.")
        if not any("a" <= c <= "z" for c in value):
            errors.append("Password needs a lower-case letter.")
        if not any("0" <= c <= "9" for c in value):
            errors.append("Password needs a digit.")
        if errors:
            raise serializers.ValidationError(errors)
        return value

    def validate_acceptTerms(self, value):
        if value is not True:
            raise serializers.ValidationError("You must accept the terms.")
        return value

    def validate(self, attrs):
        errors = {}
        local_part = attrs["email"].split("@")[0]
        if local_part in attrs["password"].lower():
            errors["password"] = ["Password must not contain your email address."]
        if not attrs["confirmPassword"] or attrs["confirmPassword"] != attrs["password"]:
            errors["confirmPassword"] = ["Passwords do not match."]
        if errors:
            raise serializers.ValidationError(errors)
        return {
            "email": attrs["email"],
            "display_name": attrs["displayName"],
            "password": attrs["password"],
        }


def is_email(email):
    at = email.find("@")
    if at <= 0 or at != email.rfind("@") or any(c.isspace() for c in email):
        return False
    domain = email[at + 1 :]
    return "." in domain and not domain.startswith(".") and not domain.endswith(".")
