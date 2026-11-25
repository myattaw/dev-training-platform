import re
from decimal import Decimal

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product
from .serializers import ProductSerializer

DECIMAL_NUMBER = re.compile(r"-?[0-9]+(\.[0-9]+)?")


def clean(value):
    """Trims a value; a blank value counts as missing (None)."""
    if value is None or not value.strip():
        return None
    return value.strip()


def parse_price(name, raw, errors):
    text = clean(raw)
    if text is None:
        return None
    if not DECIMAL_NUMBER.fullmatch(text):
        errors[name] = [f"{name} must be a number."]
        return None
    value = Decimal(text)
    if value < 0:
        errors[name] = [f"{name} must not be negative."]
        return None
    return value


class ProductListView(APIView):
    def get(self, request):
        """GET /api/products?q=&category=&minPrice=&maxPrice="""
        params = request.query_params
        errors = {}
        min_price = parse_price("minPrice", params.get("minPrice"), errors)
        max_price = parse_price("maxPrice", params.get("maxPrice"), errors)
        if min_price is not None and max_price is not None and min_price > max_price:
            errors["maxPrice"] = ["maxPrice must be greater than or equal to minPrice."]
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        products = Product.objects.all()
        text = clean(params.get("q"))
        if text is not None:
            products = products.filter(name__icontains=text)
        category = clean(params.get("category"))
        if category is not None:
            products = products.filter(category=category)
        if min_price is not None:
            products = products.filter(price__gt=min_price)
        if max_price is not None:
            products = products.filter(price__lt=max_price)
        return Response(ProductSerializer(products.order_by("id"), many=True).data)


class ProductDetailView(APIView):
    def get(self, request, pk):
        product = Product.objects.filter(pk=pk).first()
        if product is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProductSerializer(product).data)
