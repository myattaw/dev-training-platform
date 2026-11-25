from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ExpenseReport
from .serializers import ReportSerializer

# The authenticated user is request.user (a reports.identity.Identity), or None.
# Set authentication_classes and permission_classes on each view; the project
# defaults (config/settings.py) authenticate nobody and allow everything.


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """GET /api/health (public)"""
        return Response({"status": "ok"})


class ReportListView(APIView):
    def get(self, request):
        """GET /api/reports
        TODO: employees see only their own reports; admins see every report."""
        reports = ExpenseReport.objects.order_by("id")
        return Response(ReportSerializer(reports, many=True).data)

    def post(self, request):
        """POST /api/reports
        TODO: the owner is the caller, never a value from the body."""
        serializer = ReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        report = serializer.save(owner=request.data.get("owner") or "unknown")
        return Response(
            ReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/reports/{report.pk}"},
        )


class ReportDetailView(APIView):
    def get(self, request, pk):
        """GET /api/reports/<id>
        TODO: only the owner or an admin may read a report; anyone else gets 404."""
        report = ExpenseReport.objects.filter(pk=pk).first()
        if report is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReportSerializer(report).data)


class ApproveReportView(APIView):
    def post(self, request, pk):
        """POST /api/reports/<id>/approve
        TODO: admins only (403 for everyone else)."""
        report = ExpenseReport.objects.filter(pk=pk).first()
        if report is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if report.status == "approved":
            return Response(
                {"error": "The report is already approved."}, status=status.HTTP_409_CONFLICT
            )
        report.status = "approved"
        report.approved_by = getattr(request.user, "username", "unknown")
        report.save()
        return Response(ReportSerializer(report).data)
