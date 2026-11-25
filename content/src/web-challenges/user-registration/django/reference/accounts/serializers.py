from rest_framework import serializers

from .models import UserAccount


class RegistrationSerializer(serializers.ModelSerializer):
    """The public view of an account: id, email and displayName. Never the password."""

    displayName = serializers.CharField(source="display_name", read_only=True)

    class Meta:
        model = UserAccount
        fields = ["id", "email", "displayName"]
        read_only_fields = ["id", "email"]


def _text(**kwargs):
    # Every field is optional at the field level, so validate() always runs and
    # can report every invalid field at once (including the cross-field rules).
    return serializers.CharField(
        required=False, allow_null=True, allow_blank=True, trim_whitespace=False, **kwargs
    )


class RegisterRequestSerializer(serializers.Serializer):
    """Validates the body of POST /api/registrations. Duplicates are checked by the view (409)."""

    email = _text()
    displayName = _text()
    password = _text(write_only=True)
    confirmPassword = _text(write_only=True)
    acceptTerms = serializers.BooleanField(required=False, allow_null=True)

    def validate(self, attrs):
        email = (attrs.get("email") or "").strip().lower()
        display_name = (attrs.get("displayName") or "").strip()
        password = attrs.get("password") or ""
        confirm = attrs.get("confirmPassword") or ""

        errors = {}
        email_is_valid = is_email(email)
        if not email_is_valid:
            errors["email"] = ["Enter an email address like name@example.com."]
        if not 2 <= len(display_name) <= 40:
            errors["displayName"] = ["Display name must be 2-40 characters."]
        local_part = email.split("@")[0] if email_is_valid else None
        password_errors = _password_errors(password, local_part)
        if password_errors:
            errors["password"] = password_errors
        if not confirm or confirm != password:
            errors["confirmPassword"] = ["Passwords do not match."]
        if attrs.get("acceptTerms") is not True:
            errors["acceptTerms"] = ["You must accept the terms."]
        if errors:
            raise serializers.ValidationError(errors)
        return {"email": email, "display_name": display_name, "password": password}


def _password_errors(password, local_part):
    errors = []
    if len(password) < 12:
        errors.append("Password must be at least 12 characters.")
    if not any("A" <= c <= "Z" for c in password):
        errors.append("Password needs an upper-case letter.")
    if not any("a" <= c <= "z" for c in password):
        errors.append("Password needs a lower-case letter.")
    if not any("0" <= c <= "9" for c in password):
        errors.append("Password needs a digit.")
    if local_part is not None and local_part in password.lower():
        errors.append("Password must not contain your email address.")
    return errors


def is_email(email):
    at = email.find("@")
    if at <= 0 or at != email.rfind("@") or any(c.isspace() for c in email):
        return False
    domain = email[at + 1 :]
    return "." in domain and not domain.startswith(".") and not domain.endswith(".")
