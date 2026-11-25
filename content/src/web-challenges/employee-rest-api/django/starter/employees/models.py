from django.db import models

DEPARTMENTS = ["Engineering", "Finance", "Sales", "Support"]


class Employee(models.Model):
    """An employee. Ids start at 1; emails are stored in lower case."""

    name = models.CharField(max_length=100)
    email = models.CharField(max_length=254, unique=True)
    department = models.CharField(max_length=20)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.name} <{self.email}>"
