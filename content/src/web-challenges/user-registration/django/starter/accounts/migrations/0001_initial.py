from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="UserAccount",
            fields=[
                ("id", models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.CharField(max_length=254, unique=True)),
                ("display_name", models.CharField(max_length=40)),
                ("password_hash", models.CharField(max_length=200)),
            ],
            options={"ordering": ["id"]},
        ),
    ]
