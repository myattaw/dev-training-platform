from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Task",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("status", models.CharField(default="open", max_length=20)),
                ("assignee", models.CharField(blank=True, max_length=100, null=True)),
                ("due_date", models.DateField(blank=True, null=True)),
            ],
            options={"ordering": ["id"]},
        ),
    ]
