from django.urls import path

from . import views

urlpatterns = [
    path("items", views.ItemListView.as_view()),
    path("items/<str:sku>", views.ItemDetailView.as_view()),
    path("items/<str:sku>/reservations", views.ReservationView.as_view()),
    path("items/<str:sku>/supplier-quote", views.SupplierQuoteView.as_view()),
]
