"""Queries and business rules for tasks."""
from .clock import TODAY
from .models import DONE, Task


def search_tasks(status=None, overdue_only=False):
    """Tasks ordered by id, optionally only those with a status and/or only the overdue ones."""
    tasks = Task.objects.order_by("id")
    if status is not None:
        tasks = tasks.filter(status=status)
    if overdue_only:
        tasks = tasks.filter(due_date__isnull=False, due_date__lt=TODAY).exclude(status=DONE)
    return tasks


def find_task(task_id):
    return Task.objects.filter(pk=task_id).first()


def set_status(task, status):
    """Changes the status of a task and returns the task."""
    task.status = status
    task.save(update_fields=["status"])
    return task
