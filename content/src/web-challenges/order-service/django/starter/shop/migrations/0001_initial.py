import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="Product",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=100)),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("stock", models.IntegerField()),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="Order",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("customer_id", models.CharField(max_length=50)),
                ("subtotal", models.DecimalField(decimal_places=2, max_digits=12)),
                ("discount", models.DecimalField(decimal_places=2, max_digits=12)),
                ("total", models.DecimalField(decimal_places=2, max_digits=12)),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="OrderLine",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("product_name", models.CharField(max_length=100)),
                ("quantity", models.IntegerField()),
                ("unit_price", models.DecimalField(decimal_places=2, max_digits=10)),
                ("line_total", models.DecimalField(decimal_places=2, max_digits=12)),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE, related_name="lines", to="shop.order"
                    ),
                ),
                (
                    "product",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT, related_name="+", to="shop.product"
                    ),
                ),
            ],
            options={"ordering": ["id"]},
        ),
    ]
