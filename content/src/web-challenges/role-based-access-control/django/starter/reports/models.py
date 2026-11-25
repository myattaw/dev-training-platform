from django.db import models


class ExpenseReport(models.Model):
    """An expense report. Status: "submitted" or "approved"."""

    owner = models.CharField(max_length=50)
    title = models.CharField(max_length=100)
    amount_cents = models.IntegerField()
    status = models.CharField(max_length=20, default="submitted")
    approved_by = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.title} ({self.owner})"
