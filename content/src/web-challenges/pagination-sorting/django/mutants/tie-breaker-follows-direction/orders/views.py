import re

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Order
from .serializers import OrderSerializer

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 50
# API sort field -> model field.
SORT_FIELDS = {"id": "id", "customer": "customer", "total": "total", "orderDate": "order_date"}

WHOLE_NUMBER = re.compile(r"-?[0-9]{1,12}")
LARGEST_PAGE = 2_147_483_647


def clean(value):
    """Trims a value; a blank value counts as missing (None)."""
    if value is None or not value.strip():
        return None
    return value.strip()


def parse_number(name, raw, default, minimum, maximum, errors):
    text = clean(raw)
    if text is None:
        return default
    value = int(text) if WHOLE_NUMBER.fullmatch(text) else None
    if value is None or value < minimum or value > maximum:
        if maximum == LARGEST_PAGE:
            errors[name] = [f"{name} must be a whole number of at least {minimum}."]
        else:
            errors[name] = [f"{name} must be a whole number from {minimum} to {maximum}."]
        return default
    return value


class OrderListView(APIView):
    def get(self, request):
        """GET /api/orders?page=&pageSize=&sort=&direction="""
        params = request.query_params
        errors = {}
        page = parse_number("page", params.get("page"), 1, 1, LARGEST_PAGE, errors)
        page_size = parse_number(
            "pageSize", params.get("pageSize"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE, errors
        )
        sort = clean(params.get("sort")) or "id"
        if sort not in SORT_FIELDS:
            errors["sort"] = [f"sort must be one of: {', '.join(SORT_FIELDS)}."]
        direction = clean(params.get("direction")) or "asc"
        if direction not in ("asc", "desc"):
            errors["direction"] = ["direction must be asc or desc."]
        if errors:
            return Response({"errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        field = SORT_FIELDS[sort]
        ordering = f"-{field}" if direction == "desc" else field
        orders = Order.objects.order_by(ordering, "-id" if direction == "desc" else "id")
        total_count = orders.count()
        start = (page - 1) * page_size
        items = orders[start : start + page_size] if start < total_count else []
        return Response(
            {
                "items": OrderSerializer(items, many=True).data,
                "page": page,
                "pageSize": page_size,
                "totalCount": total_count,
                "totalPages": (total_count + page_size - 1) // page_size,
            }
        )
