"""Create (or update) the weekly Manager Report email automation.

Idempotent: safe to run repeatedly. The automation is left DISABLED unless
--enable is passed, so deploying this never starts sending on its own.

    python manage.py setup_manager_report_email            # create, stays off
    python manage.py setup_manager_report_email --enable   # create and turn on
"""
from django.core.management.base import BaseCommand


AUTOMATION_NAME = "Manager weekly report"

RECIPIENTS = [
    ("louis.visagie@afsq.co.za", "Louis Visagie"),
    ("armand.visagie@afsq.co.za", "Armand Visagie"),
    ("nicole.bergh@afsq.co.za", "Nicole Bergh"),
    ("simphiwe.mathenjwa@afsq.co.za", "Simphiwe Mathenjwa"),
]

BODY = (
    "Good day,\n\n"
    "Please find attached the Weekly Manager Report for {week}.\n\n"
    "Summary for the week:\n"
    "- Inspections completed: {inspections}\n"
    "- Overall compliance: {compliance}\n"
    "- Samples taken: {samples}\n"
    "- Kilometres travelled: {km}\n\n"
    "Regards,\n"
    "APS System"
)


class Command(BaseCommand):
    help = "Create/update the weekly Manager Report email automation and its recipients"

    def add_arguments(self, parser):
        parser.add_argument('--enable', action='store_true',
                            help='Turn the automation on (default: leave it off)')

    def handle(self, *args, **options):
        from main.models import EmailAutomation, WeeklyEmailRecipient

        automation, created = EmailAutomation.objects.get_or_create(
            name=AUTOMATION_NAME,
            defaults={
                'enabled': False,
                'per_inspector': False,
                'report_type': 'manager',
                'schedule_type': 'weekly',
                'send_day_of_week': 0,   # Monday
                'send_hour': 6,          # 06:00
                'subject': 'Weekly Manager Report - {week}',
                'body': BODY,
            },
        )

        # Keep the important settings correct even if the row already existed.
        automation.report_type = 'manager'
        automation.per_inspector = False
        automation.schedule_type = 'weekly'
        automation.send_day_of_week = 0
        automation.send_hour = 6
        if options['enable']:
            automation.enabled = True
        automation.save()

        self.stdout.write(self.style.SUCCESS(
            f"{'Created' if created else 'Updated'} automation #{automation.id} "
            f"'{automation.name}' (report_type={automation.report_type}, "
            f"Monday {automation.send_hour:02d}:00, enabled={automation.enabled})"
        ))

        for email, name in RECIPIENTS:
            rec, made = WeeklyEmailRecipient.objects.get_or_create(
                automation=automation, email=email,
                defaults={'name': name, 'active': True},
            )
            if not made and not rec.active:
                rec.active = True
                rec.save(update_fields=['active'])
            self.stdout.write(f"  {'added' if made else 'present'}: {email} ({name})")

        if not automation.enabled:
            self.stdout.write(self.style.WARNING(
                "Automation is OFF. Re-run with --enable to start sending."))
