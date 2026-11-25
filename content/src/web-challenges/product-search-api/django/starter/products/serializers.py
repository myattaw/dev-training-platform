from rest_framework import serializers

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    """A product as returned by the API: id, name, category, price, inStock."""

    inStock = serializers.BooleanField(source="in_stock")

    class Meta:
        model = Product
        fields = ["id", "name", "category", "price", "inStock"]
