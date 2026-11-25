from django.db import models


class Order(models.Model):
    """A customer order. Totals have two decimal places. No default ordering."""

    customer = models.CharField(max_length=100)
    total = models.DecimalField(max_digits=10, decimal_places=2)
    order_date = models.DateField()
    status = models.CharField(max_length=20)

    def __str__(self):
        return f"Order {self.pk} ({self.customer})"
