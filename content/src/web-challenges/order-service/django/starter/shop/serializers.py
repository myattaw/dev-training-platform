from rest_framework import serializers

from .models import Order, OrderLine, Product


def money(source=None):
    """A read-only amount with 2 decimal places, rendered as a JSON number."""
    options = {"source": source} if source else {}
    return serializers.DecimalField(
        max_digits=12, decimal_places=2, coerce_to_string=False, read_only=True, **options
    )


class ProductSerializer(serializers.ModelSerializer):
    unitPrice = money("unit_price")

    class Meta:
        model = Product
        fields = ["id", "name", "unitPrice", "stock"]


class OrderLineSerializer(serializers.ModelSerializer):
    productId = serializers.IntegerField(source="product_id", read_only=True)
    productName = serializers.CharField(source="product_name", read_only=True)
    unitPrice = money("unit_price")
    lineTotal = money("line_total")

    class Meta:
        model = OrderLine
        fields = ["productId", "productName", "quantity", "unitPrice", "lineTotal"]


class OrderSerializer(serializers.ModelSerializer):
    """An order as returned by the API."""

    customerId = serializers.CharField(source="customer_id", read_only=True)
    lines = OrderLineSerializer(many=True, read_only=True)
    subtotal = money()
    discount = money()
    total = money()

    class Meta:
        model = Order
        fields = ["id", "customerId", "lines", "subtotal", "discount", "total"]


class OrderInputSerializer(serializers.Serializer):
    """Validates the body of POST /api/orders.

    TODO: `customerId` (trimmed, 1-50 characters) and `lines`: at least one
    line, each with a known `productId` and a `quantity` from 1 to 100. Errors
    for a line must appear under errors.lines[<index>].<field>; a nested
    serializer with many=True does exactly that.
    """
