from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .serializers import StatusSerializer, TaskSerializer


def not_found():
    return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)


class TaskListView(APIView):
    def get(self, request):
        """GET /api/tasks?status=open&overdue=true"""
        status_filter = request.query_params.get("status")
        overdue = request.query_params.get("overdue", "").lower() == "true"
        tasks = services.search_tasks(status_filter, overdue)
        return Response(TaskSerializer(tasks, many=True).data)

    def post(self, request):
        """POST /api/tasks"""
        serializer = TaskSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        task = serializer.save()
        return Response(TaskSerializer(task).data)


class TaskDetailView(APIView):
    def get(self, request, pk):
        """GET /api/tasks/<id>"""
        task = services.find_task(pk)
        if task is None:
            return not_found()
        return Response(TaskSerializer(task).data)


class TaskStatusView(APIView):
    def put(self, request, pk):
        """PUT /api/tasks/<id>/status"""
        task = services.find_task(pk)
        if task is None:
            return not_found()
        serializer = StatusSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"errors": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)
        task = services.set_status(task, serializer.validated_data["status"])
        return Response(TaskSerializer(task).data)
