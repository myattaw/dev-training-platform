"""The HTTP layer only maps requests to the services. It does not catch
exceptions: errors are turned into responses in one central place
(REST_FRAMEWORK["EXCEPTION_HANDLER"] in config/settings.py)."""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class ItemListView(APIView):
    def get(self, request):
        return Response([services.to_json(item) for item in services.all_items()])

    def post(self, request):
        item = services.create_item(request.data)
        return Response(
            services.to_json(item),
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/items/{item.sku}"},
        )


class ItemDetailView(APIView):
    def get(self, request, sku):
        return Response(services.to_json(services.get_item(sku)))


class ReservationView(APIView):
    def post(self, request, sku):
        return Response(services.to_json(services.reserve(sku, request.data)))


class SupplierQuoteView(APIView):
    def get(self, request, sku):
        return Response(services.supplier_quote(sku))
