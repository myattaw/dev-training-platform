from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product
from .serializers import ProductSerializer


def not_found():
    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)


class ProductListView(APIView):
    def get(self, request):
        """GET /api/products"""
        return Response(ProductSerializer(Product.objects.order_by("id"), many=True).data)


class ProductDetailView(APIView):
    def get(self, request, pk):
        """GET /api/products/<id>"""
        product = Product.objects.filter(pk=pk).first()
        if product is None:
            return not_found()
        return Response(ProductSerializer(product).data)


class OrderListView(APIView):
    def post(self, request):
        """TODO: POST /api/orders: 201 with a Location header and the order,
        400 with {"errors": {...}} for invalid input, 409 with
        {"message", "productId"} when a product does not have enough stock."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)


class OrderDetailView(APIView):
    def get(self, request, pk):
        """TODO: GET /api/orders/<id>: 200 with the order, or 404."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)
