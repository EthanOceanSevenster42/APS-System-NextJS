"""Admin API for the Email Automation page.

Several automations can exist, each with its own on/off switch, subject,
message and recipient list (e.g. one email for management, another for the
WhatsApp group owner). Management can create, edit and delete automations,
manage recipients, send tests, and see the send log. Management-only.
"""
import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..models import EmailAutomation, WeeklyEmailLog, WeeklyEmailRecipient

ADMIN_ROLES = ('super_admin', 'developer', 'admin')
PLACEHOLDERS = ['{name}', '{week}', '{inspections}', '{compliance}', '{samples}', '{km}']


def _gate(request):
    if getattr(request.user, 'role', '') not in ADMIN_ROLES:
        return JsonResponse({'success': False, 'error': 'Not authorised'}, status=403)
    return None


def _automation_dict(a):
    import os as _os
    return {
        'id': a.id,
        'name': a.name,
        'enabled': a.enabled,
        'per_inspector': a.per_inspector,
        'report_type': getattr(a, 'report_type', 'full') or 'full',
        'subject': a.subject,
        'body': a.body,
        'signature': a.signature,
        'schedule_type': a.schedule_type,
        'send_day_of_week': a.send_day_of_week,
        'send_day_of_month': a.send_day_of_month,
        'send_hour': a.send_hour,
        'attachment_name': _os.path.basename(a.attachment.name) if a.attachment else '',
        'signature_image_name': _os.path.basename(a.signature_image.name) if a.signature_image else '',
        'updated_by': a.updated_by,
        'updated_at': a.updated_at.isoformat() if a.updated_at else None,
        'recipients': [
            {'id': r.id, 'email': r.email, 'name': r.name, 'active': r.active}
            for r in a.recipients.all()
        ],
    }


def _payload():
    return {
        'automations': [_automation_dict(a) for a in EmailAutomation.objects.prefetch_related('recipients')],
        'placeholders': PLACEHOLDERS,
    }


@csrf_exempt
@login_required
def api_weekly_email_settings(request):
    """GET — all automations with their recipients.
    POST {action: create|update|delete, ...} — manage automations."""
    gate = _gate(request)
    if gate:
        return gate
    if request.method == 'POST':
        try:
            data = json.loads(request.body or '{}')
        except json.JSONDecodeError:
            return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)
        action = data.get('action', 'update')
        user = request.user.get_username()
        if action == 'create':
            name = str(data.get('name', '')).strip()[:120]
            if not name:
                return JsonResponse({'success': False, 'error': 'Give the automation a name'}, status=400)
            EmailAutomation.objects.create(name=name, updated_by=user)
        else:
            try:
                a = EmailAutomation.objects.get(id=data.get('id'))
            except EmailAutomation.DoesNotExist:
                return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)
            if action == 'delete':
                a.delete()
            elif action == 'update':
                if 'enabled' in data:
                    a.enabled = bool(data['enabled'])
                if 'per_inspector' in data:
                    a.per_inspector = bool(data['per_inspector'])
                if 'report_type' in data:
                    rt = str(data['report_type']).strip().lower()
                    if rt in {'full', 'manager', 'finance'}:
                        a.report_type = rt
                if 'name' in data:
                    name = str(data['name']).strip()[:120]
                    if name:
                        a.name = name
                if 'subject' in data:
                    subject = str(data['subject']).strip()
                    if subject:
                        a.subject = subject[:255]
                if 'body' in data:
                    a.body = str(data['body'])
                if 'signature' in data:
                    a.signature = str(data['signature'])
                if data.get('schedule_type') in ('weekly', 'daily', 'monthly'):
                    a.schedule_type = data['schedule_type']
                if 'send_day_of_week' in data:
                    try:
                        a.send_day_of_week = min(6, max(0, int(data['send_day_of_week'])))
                    except (TypeError, ValueError):
                        pass
                if 'send_day_of_month' in data:
                    try:
                        a.send_day_of_month = min(28, max(1, int(data['send_day_of_month'])))
                    except (TypeError, ValueError):
                        pass
                if 'send_hour' in data:
                    try:
                        a.send_hour = min(23, max(0, int(data['send_hour'])))
                    except (TypeError, ValueError):
                        pass
                a.updated_by = user
                a.save()
            else:
                return JsonResponse({'success': False, 'error': 'Unknown action'}, status=400)
    return JsonResponse({'success': True, **_payload()})


@csrf_exempt
@login_required
def api_weekly_email_recipient(request):
    """POST {action: add|toggle|delete, automation_id?, email?, name?, id?}."""
    gate = _gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'error': 'Invalid JSON'}, status=400)

    action = data.get('action')
    if action == 'add':
        try:
            automation = EmailAutomation.objects.get(id=data.get('automation_id'))
        except EmailAutomation.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)
        email = str(data.get('email', '')).strip().lower()
        name = str(data.get('name', '')).strip()[:150]
        if not name:
            return JsonResponse({'success': False, 'error': "Enter the person's name — it is recorded in the send log so every email is traceable."}, status=400)
        if '@' not in email or '.' not in email.split('@')[-1]:
            return JsonResponse({'success': False, 'error': 'Enter a valid email address'}, status=400)
        from ..services.weekly_email_service import BLOCKED_RECIPIENTS
        if email in BLOCKED_RECIPIENTS:
            return JsonResponse({'success': False, 'error': 'This address cannot be added to the list'}, status=400)
        if automation.recipients.filter(email=email).exists():
            return JsonResponse({'success': False, 'error': 'That address is already on this list'}, status=400)
        WeeklyEmailRecipient.objects.create(
            automation=automation,
            email=email,
            name=name,
            added_by=request.user.get_username(),
        )
    elif action in ('toggle', 'delete'):
        try:
            rec = WeeklyEmailRecipient.objects.get(id=data.get('id'))
        except WeeklyEmailRecipient.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Recipient not found'}, status=404)
        if action == 'toggle':
            rec.active = not rec.active
            rec.save(update_fields=['active'])
        else:
            rec.delete()
    else:
        return JsonResponse({'success': False, 'error': 'Unknown action'}, status=400)
    return JsonResponse({'success': True, **_payload()})


@csrf_exempt
@login_required
def api_weekly_email_users(request):
    """GET — system users (with an email address) for the recipient picker."""
    gate = _gate(request)
    if gate:
        return gate
    from django.contrib.auth import get_user_model
    User = get_user_model()
    users = []
    for u in User.objects.filter(is_active=True).exclude(email='').exclude(email__isnull=True).order_by('first_name', 'last_name'):
        name = f"{u.first_name} {u.last_name}".strip() or u.username
        users.append({'name': name, 'email': u.email, 'role': getattr(u, 'role', '') or ''})
    return JsonResponse({'success': True, 'users': users})


@csrf_exempt
@login_required
def api_weekly_email_logs(request):
    gate = _gate(request)
    if gate:
        return gate
    logs = [
        {
            'automation': l.automation_name or (l.automation.name if l.automation else ''),
            'run_at': l.run_at.isoformat(),
            'week_start': l.week_start.isoformat(),
            'week_end': l.week_end.isoformat(),
            'status': l.status,
            'recipients': l.recipients,
            'error': l.error,
            'triggered_by': l.triggered_by,
        }
        for l in WeeklyEmailLog.objects.select_related('automation')[:80]
    ]
    return JsonResponse({'success': True, 'logs': logs})


@csrf_exempt
@login_required
def api_weekly_email_test(request):
    """POST {automation_id, to?} — send that automation's email as a test
    (defaults to the logged-in user's address). Ignores the switch, logs TEST."""
    gate = _gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        data = {}
    try:
        automation = EmailAutomation.objects.get(id=data.get('automation_id'))
    except EmailAutomation.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)
    to = str(data.get('to', '')).strip() or (request.user.email or '').strip()
    if '@' not in to:
        return JsonResponse({
            'success': False,
            'error': 'No email address on your account — enter one to send the test to.',
        }, status=400)

    from ..services.weekly_email_service import send_automation_email
    log = send_automation_email(automation, triggered_by=request.user.get_username(), test_to=to)
    ok = log.status == 'TEST'
    return JsonResponse({
        'success': ok,
        'status': log.status,
        'error': log.error,
        'to': to,
    }, status=200 if ok else 502)


@csrf_exempt
@login_required
def api_weekly_email_send_now(request):
    """POST {automation_id} — send this automation's email to its recipient
    list RIGHT NOW. A deliberate human action: ignores the switch and the
    schedule, but still needs active recipients. Logged like any send."""
    gate = _gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'}, status=405)
    try:
        data = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        data = {}
    try:
        automation = EmailAutomation.objects.get(id=data.get('automation_id'))
    except EmailAutomation.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)

    from ..services.weekly_email_service import send_automation_email
    log = send_automation_email(automation, triggered_by=f"send now ({request.user.get_username()})", manual=True)
    ok = log.status == 'SENT'
    return JsonResponse({
        'success': ok,
        'status': log.status,
        'recipients': log.recipients,
        'error': log.error,
    }, status=200 if ok else 502)


IMAGE_EXTENSIONS = ('.png', '.jpg', '.jpeg', '.gif', '.webp')


@csrf_exempt
@login_required
def api_weekly_email_attachment(request):
    """POST multipart {automation_id, file, kind} — upload the extra
    attachment (kind='attachment', default) or the picture signature
    (kind='signature'). POST JSON {action: 'remove', automation_id, kind}
    — remove it."""
    gate = _gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return JsonResponse({'success': False, 'error': 'POST required'}, status=405)

    if request.content_type and 'multipart' in request.content_type:
        try:
            automation = EmailAutomation.objects.get(id=request.POST.get('automation_id'))
        except EmailAutomation.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)
        kind = request.POST.get('kind', 'attachment')
        f = request.FILES.get('file')
        if not f:
            return JsonResponse({'success': False, 'error': 'No file received'}, status=400)
        if kind == 'signature':
            if not str(f.name).lower().endswith(IMAGE_EXTENSIONS):
                return JsonResponse({'success': False, 'error': 'The signature must be a picture (PNG, JPG, GIF or WebP)'}, status=400)
            if f.size > 5 * 1024 * 1024:
                return JsonResponse({'success': False, 'error': 'Picture too big — 5 MB maximum'}, status=400)
            if automation.signature_image:
                automation.signature_image.delete(save=False)
            automation.signature_image = f
        else:
            if f.size > 10 * 1024 * 1024:
                return JsonResponse({'success': False, 'error': 'File too big — 10 MB maximum'}, status=400)
            if automation.attachment:
                automation.attachment.delete(save=False)
            automation.attachment = f
        automation.updated_by = request.user.get_username()
        automation.save()
    else:
        try:
            data = json.loads(request.body or '{}')
        except json.JSONDecodeError:
            data = {}
        if data.get('action') != 'remove':
            return JsonResponse({'success': False, 'error': 'Unknown action'}, status=400)
        try:
            automation = EmailAutomation.objects.get(id=data.get('automation_id'))
        except EmailAutomation.DoesNotExist:
            return JsonResponse({'success': False, 'error': 'Automation not found'}, status=404)
        if data.get('kind') == 'signature':
            if automation.signature_image:
                automation.signature_image.delete(save=False)
                automation.signature_image = None
                automation.updated_by = request.user.get_username()
                automation.save()
        elif automation.attachment:
            automation.attachment.delete(save=False)
            automation.attachment = None
            automation.updated_by = request.user.get_username()
            automation.save()
    return JsonResponse({'success': True, **_payload()})
