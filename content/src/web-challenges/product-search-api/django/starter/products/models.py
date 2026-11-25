from django.db import models


class Product(models.Model):
    """A catalog product. Prices have two decimal places."""

    name = models.CharField(max_length=100)
    category = models.CharField(max_length=30)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    in_stock = models.BooleanField(default=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return self.name
