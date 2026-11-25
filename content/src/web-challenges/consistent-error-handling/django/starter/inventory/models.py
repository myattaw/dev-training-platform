from django.db import models


class Item(models.Model):
    """A stocked item, identified by its SKU (for example KBD-101)."""

    sku = models.CharField(max_length=7, unique=True)
    name = models.CharField(max_length=80)
    quantity = models.PositiveIntegerField()

    class Meta:
        ordering = ["sku"]

    def __str__(self):
        return f"{self.sku} {self.name}"
