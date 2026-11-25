from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Product
from .serializers import ProductSerializer


class ProductListView(APIView):
    def get(self, request):
        """GET /api/products

        TODO: read the optional query parameters q, category, minPrice and
        maxPrice (missing or blank means no filter), answer 400 with
        {"errors": {parameter: [messages]}} when they are invalid, and return
        only the products that match every filter, ordered by id.
        """
        products = Product.objects.order_by("id")
        return Response(ProductSerializer(products, many=True).data)


class ProductDetailView(APIView):
    def get(self, request, pk):
        """TODO: GET /api/products/<id>: 200 with the product, or 404."""
        return Response(status=status.HTTP_501_NOT_IMPLEMENTED)
