from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="ExpenseReport",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("owner", models.CharField(max_length=50)),
                ("title", models.CharField(max_length=100)),
                ("amount_cents", models.IntegerField()),
                ("status", models.CharField(default="submitted", max_length=20)),
                ("approved_by", models.CharField(blank=True, max_length=50, null=True)),
            ],
            options={"ordering": ["id"]},
        ),
    ]
