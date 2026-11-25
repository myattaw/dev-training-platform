from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order
from .serializers import OrderSerializer

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
# API sort field -> model field.
SORT_FIELDS = {"id": "id", "customer": "customer", "total": "total", "orderDate": "order_date"}


class OrderListView(APIView):
    def get(self, request):
        """GET /api/orders

        TODO: read the optional query parameters page, pageSize, sort and
        direction (missing or blank means the default), answer 400 with
        {"errors": {parameter: [messages]}} when they are invalid, sort with id
        as the tie-breaker, and return the requested page with its totals.
        """
        # For now: always the first ten orders by id, with placeholder totals.
        orders = Order.objects.order_by("id")
        return Response(
            {
                "items": OrderSerializer(orders[:DEFAULT_PAGE_SIZE], many=True).data,
                "page": 1,
                "pageSize": DEFAULT_PAGE_SIZE,
                "totalCount": orders.count(),
                "totalPages": 1,
            }
        )
