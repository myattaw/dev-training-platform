from django.urls import path

from . import views

urlpatterns = [
    path("health", views.HealthView.as_view()),
    path("reports", views.ReportListView.as_view()),
    path("reports/<int:pk>", views.ReportDetailView.as_view()),
    path("reports/<int:pk>/approve", views.ApproveReportView.as_view()),
]
