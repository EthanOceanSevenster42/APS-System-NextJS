from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0050_emailautomation_report_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="foodsafetyagencyinspection",
            name="internal_sample_number",
            field=models.CharField(
                blank=True,
                default="",
                max_length=64,
                help_text="Sample number generated on the handset and written on the bag",
            ),
        ),
    ]
