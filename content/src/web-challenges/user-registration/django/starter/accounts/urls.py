from django.urls import path

from . import views

urlpatterns = [
    path("registrations", views.RegistrationListView.as_view()),
    path("registrations/<int:pk>", views.RegistrationDetailView.as_view()),
]
