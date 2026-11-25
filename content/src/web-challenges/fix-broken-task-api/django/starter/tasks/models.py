from django.db import models

OPEN = "open"
IN_PROGRESS = "in_progress"
DONE = "done"
STATUSES = [OPEN, IN_PROGRESS, DONE]


class Task(models.Model):
    """A task. Ids start at 1; new tasks start as "open"."""

    title = models.CharField(max_length=200)
    status = models.CharField(max_length=20, default=OPEN)
    assignee = models.CharField(max_length=100, null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"#{self.pk} {self.title} ({self.status})"
