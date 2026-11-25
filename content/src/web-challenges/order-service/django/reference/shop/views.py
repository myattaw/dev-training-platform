from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Order, Product
from .serializers import OrderInputSerializer, OrderSerializer, ProductSerializer


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
        """POST /api/orders"""
        serializer = OrderInputSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        data = serializer.validated_data
        lines = [{"productId": l["productId"], "quantity": l["quantity"]} for l in data["lines"]]
        try:
            order = services.place_order(data["customerId"], lines)
        except services.InsufficientStock as short:
            return Response(
                {"message": str(short), "productId": short.product_id},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            OrderSerializer(order).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/orders/{order.pk}"},
        )


class OrderDetailView(APIView):
    def get(self, request, pk):
        """GET /api/orders/<id>"""
        order = Order.objects.filter(pk=pk).first()
        if order is None:
            return not_found()
        return Response(OrderSerializer(order).data)
