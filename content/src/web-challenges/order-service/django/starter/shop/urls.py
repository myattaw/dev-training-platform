from django.urls import path

from . import views

urlpatterns = [
    path("products", views.ProductListView.as_view()),
    path("products/<int:pk>", views.ProductDetailView.as_view()),
    path("orders", views.OrderListView.as_view()),
    path("orders/<int:pk>", views.OrderDetailView.as_view()),
]
