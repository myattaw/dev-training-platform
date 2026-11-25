from django.db import models


class Product(models.Model):
    """A product. Prices are exact decimals with 2 decimal places."""

    name = models.CharField(max_length=100)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.IntegerField()

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} ({self.stock} in stock)"


class Order(models.Model):
    """An order. Amounts have 2 decimal places."""

    customer_id = models.CharField(max_length=50)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]


class OrderLine(models.Model):
    """One line of an order: the product, its price at the time of the order, and the line total."""

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="+")
    product_name = models.CharField(max_length=100)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ["id"]
