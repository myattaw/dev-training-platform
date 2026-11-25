from rest_framework import serializers

from .models import STATUSES, Task


class TaskSerializer(serializers.ModelSerializer):
    """Reads tasks and validates new ones. New tasks always start as "open"."""

    title = serializers.CharField(max_length=200)
    assignee = serializers.CharField(max_length=100, required=False, allow_null=True, allow_blank=True)
    dueDate = serializers.DateField(source="due_date", required=False, allow_null=True)

    class Meta:
        model = Task
        fields = ["id", "title", "status", "assignee", "dueDate"]
        read_only_fields = ["status"]

    def validate_assignee(self, value):
        return value or None


class StatusSerializer(serializers.Serializer):
    """The body of PUT /api/tasks/<id>/status."""

    status = serializers.ChoiceField(choices=STATUSES)
