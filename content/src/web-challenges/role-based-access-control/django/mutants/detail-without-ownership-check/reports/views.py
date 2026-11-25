from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import BearerTokenAuthentication
from .models import ExpenseReport
from .permissions import IsAdmin
from .serializers import ReportSerializer


def visible_reports(user):
    """Employees see their own reports; admins see every report."""
    reports = ExpenseReport.objects.order_by("id")
    return reports if user.is_admin else reports.filter(owner=user.username)


class HealthView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        """GET /api/health (public)"""
        return Response({"status": "ok"})


class AuthenticatedView(APIView):
    """Every report endpoint needs a valid bearer token (401 otherwise)."""

    authentication_classes = [BearerTokenAuthentication]
    permission_classes = [IsAuthenticated]


class ReportListView(AuthenticatedView):
    def get(self, request):
        """GET /api/reports"""
        return Response(ReportSerializer(visible_reports(request.user), many=True).data)

    def post(self, request):
        """POST /api/reports: the owner is the authenticated caller."""
        serializer = ReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        report = serializer.save(owner=request.user.username)
        return Response(
            ReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
            headers={"Location": f"/api/reports/{report.pk}"},
        )


class ReportDetailView(AuthenticatedView):
    def get(self, request, pk):
        """GET /api/reports/<id>: 404 (not 403) for someone else's report, so ids
        of other people's reports are not revealed."""
        report = ExpenseReport.objects.filter(pk=pk).first()
        if report is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReportSerializer(report).data)


class ApproveReportView(AuthenticatedView):
    # The role is checked before the report is looked up: employees get 403
    # whether or not the report exists.
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request, pk):
        """POST /api/reports/<id>/approve"""
        report = ExpenseReport.objects.filter(pk=pk).first()
        if report is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if report.status == "approved":
            return Response(
                {"error": "The report is already approved."}, status=status.HTTP_409_CONFLICT
            )
        report.status = "approved"
        report.approved_by = request.user.username
        report.save()
        return Response(ReportSerializer(report).data)
