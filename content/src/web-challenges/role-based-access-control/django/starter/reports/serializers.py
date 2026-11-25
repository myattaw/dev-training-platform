from rest_framework import serializers

from .models import ExpenseReport


class ReportSerializer(serializers.ModelSerializer):
    """Reads and validates expense reports. `owner`, `status` and `approvedBy`
    are read-only: they are never taken from a request body."""

    amountCents = serializers.IntegerField(
        source="amount_cents", min_value=1, max_value=1_000_000
    )
    approvedBy = serializers.CharField(source="approved_by", read_only=True, allow_null=True)

    class Meta:
        model = ExpenseReport
        fields = ["id", "owner", "title", "amountCents", "status", "approvedBy"]
        read_only_fields = ["id", "owner", "status"]
