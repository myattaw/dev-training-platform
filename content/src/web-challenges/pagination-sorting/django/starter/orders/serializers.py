from rest_framework import serializers

from .models import Order


class OrderSerializer(serializers.ModelSerializer):
    """An order as returned by the API: id, customer, total, orderDate, status."""

    orderDate = serializers.DateField(source="order_date")

    class Meta:
        model = Order
        fields = ["id", "customer", "total", "orderDate", "status"]
