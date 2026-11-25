from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Item",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sku", models.CharField(max_length=7, unique=True)),
                ("name", models.CharField(max_length=80)),
                ("quantity", models.PositiveIntegerField()),
            ],
            options={"ordering": ["sku"]},
        ),
    ]
