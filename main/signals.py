from django.db.models.signals import post_save, pre_save, pre_delete
from django.dispatch import receiver
import decimal
from django.contrib.auth.models import User
from main.models import InspectorMapping, FoodSafetyAgencyInspection, InspectionGroup

# ---------------------------------------------------------------------------
# Inspection audit helpers
# ---------------------------------------------------------------------------

_INSPECTION_FIELDS = [
    ('commodity',                               'Commodity'),
    ('date_of_inspection',                      'Date of Inspection'),
    ('inspector_name',                          'Inspector'),
    ('is_product_compliant',                    'Product Compliant'),
    ('product_name',                            'Product Name'),
    ('product_class',                           'Product Class'),
    ('is_sample_taken',                         'Sample Taken'),
    ('bought_sample',                           'Sample Amount (R)'),
    ('km_traveled',                             'KM Traveled'),
    ('hours',                                   'Hours'),
    ('additional_email',                        'Additional Email'),
    ('approved_status',                         'Approved Status'),
    ('comment',                                 'Comment'),
    ('lab',                                     'Lab'),
    ('client_name',                             'Client Name'),
    ('town',                                    'Town'),
    ('inspected',                               'Inspected'),
    ('follow_up',                               'Follow Up'),
    ('occurrence_report',                       'Occurrence Report'),
    ('dispensation_application',                'Dispensation Application'),
    ('is_direction_present_for_this_inspection','Direction Present'),
    ('fat',                                     'Fat Test'),
    ('protein',                                 'Protein Test'),
    ('calcium',                                 'Calcium Test'),
    ('dna',                                     'DNA Test'),
]

_GROUP_FIELDS = [
    ('client_name',       'Client Name'),
    ('date_of_inspection','Date of Inspection'),
    ('inspector_name',    'Inspector'),
    ('town',              'Town'),
    ('facility_type',     'Facility Type'),
    ('group_type',        'Group Type'),
    ('corporate_group',   'Corporate Group'),
    ('additional_email',  'Additional Email'),
    ('comment',           'Comment'),
    ('km_traveled',       'KM Traveled'),
    ('hours',             'Hours'),
]


def _to_str(v):
    """Convert any field value to a JSON-safe string for comparison."""
    if v is None:
        return None
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)


def _build_changes(old_obj, new_obj, tracked_fields):
    changes = {}
    for field, label in tracked_fields:
        old_val = _to_str(getattr(old_obj, field, None))
        new_val = _to_str(getattr(new_obj, field, None))
        if old_val != new_val:
            changes[field] = {'label': label, 'old': old_val, 'new': new_val}
    return changes


@receiver(pre_save, sender=FoodSafetyAgencyInspection)
def capture_inspection_changes(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    changes = _build_changes(old, instance, _INSPECTION_FIELDS)
    if not changes:
        return

    from main.models import InspectionEditHistory
    from main.middleware import get_current_user
    user = get_current_user()
    try:
        InspectionEditHistory.objects.create(
            object_type='inspection',
            object_id=instance.pk,
            inspection_group_id=instance.inspection_group_id,
            client_name=instance.client_name or '',
            date_of_inspection=instance.date_of_inspection,
            inspector_name=instance.inspector_name or '',
            edited_by=user if user and getattr(user, 'is_authenticated', False) else None,
            changes=changes,
            change_count=len(changes),
        )
    except Exception:
        pass


@receiver(pre_save, sender=InspectionGroup)
def capture_group_changes(sender, instance, **kwargs):
    if not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
    except sender.DoesNotExist:
        return

    changes = _build_changes(old, instance, _GROUP_FIELDS)
    if not changes:
        return

    from main.models import InspectionEditHistory
    from main.middleware import get_current_user
    user = get_current_user()
    try:
        InspectionEditHistory.objects.create(
            object_type='group',
            object_id=instance.pk,
            inspection_group_id=instance.pk,
            client_name=instance.client_name or '',
            date_of_inspection=instance.date_of_inspection,
            inspector_name=instance.inspector_name or '',
            edited_by=user if user and getattr(user, 'is_authenticated', False) else None,
            changes=changes,
            change_count=len(changes),
        )
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Deletion archive
# ---------------------------------------------------------------------------

def _json_safe(value):
    """Coerce a model field value into something JSONField can store."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, decimal.Decimal):
        # str, not float — keeps cent-level precision for money/km/hours.
        return str(value)
    if hasattr(value, 'isoformat'):          # date / datetime / time
        return value.isoformat()
    if isinstance(value, (list, dict)):
        return value
    return str(value)


@receiver(pre_delete, sender=FoodSafetyAgencyInspection)
def archive_deleted_inspection(sender, instance, **kwargs):
    """Snapshot an inspection into DeletedInspectionArchive before it is removed.

    Hooked on pre_delete rather than at the individual call sites because
    inspections are deleted from five different places (the Next.js edit
    wizard, the legacy Django edit form, two single-delete views and the
    group delete) — and from cascades. A model-level hook cannot be bypassed
    by a new code path someone adds later.

    Every field is captured generically off _meta, so fields added to the
    inspection model in future are archived without touching this function.
    """
    from main.models import DeletedInspectionArchive, InspectionDocument
    from main.middleware import get_current_user, get_current_path

    try:
        snapshot = {
            f.name: _json_safe(f.value_from_object(instance))
            for f in instance._meta.concrete_fields
        }

        # Captured BEFORE the cascade wipes them.
        documents = [{
            'document_type': d.document_type,
            'uploaded_date': d.uploaded_date.isoformat() if d.uploaded_date else None,
            'uploaded_by': (d.uploaded_by.get_full_name() or d.uploaded_by.username) if d.uploaded_by else None,
        } for d in InspectionDocument.objects.filter(inspection_id=instance.pk).select_related('uploaded_by')]

        user = get_current_user()
        DeletedInspectionArchive.objects.create(
            original_id=instance.pk,
            remote_id=instance.remote_id,
            inspection_group_ref=instance.inspection_group_id,
            client_name=instance.client_name or '',
            commodity=instance.commodity or '',
            product_name=instance.product_name or '',
            date_of_inspection=instance.date_of_inspection,
            inspector_name=instance.inspector_name or '',
            snapshot=snapshot,
            documents=documents,
            document_count=len(documents),
            deleted_by=user if user and getattr(user, 'is_authenticated', False) else None,
            source=(get_current_path() or '')[:200],
        )
    except Exception:
        # Archiving must never be the reason a delete fails.
        pass


@receiver(post_save, sender=User)
def create_inspector_mapping(sender, instance, created, **kwargs):
    """Ensure every inspector user has an inspector number (InspectorMapping).

    Runs on every save, not just creation: user management sets the role AFTER
    User.objects.create_user(), so at insert time every user briefly carries
    the default 'inspector' role — a created-only hook both missed real
    inspectors (role arrives one save later) and minted junk mappings for
    admins/testers. Checking the current role on each save self-heals any
    inspector who is somehow missing a number.
    """
    if getattr(instance, 'role', None) != 'inspector':
        return
    full_name = (instance.get_full_name() or instance.username).strip()
    if not full_name:
        return
    try:
        if InspectorMapping.objects.filter(inspector_name__iexact=full_name).exists():
            return
        # Prefer the number already on this inspector's records (remote-synced
        # data carries the source system's ID) if no other mapping holds it.
        inspector_id = (
            FoodSafetyAgencyInspection.objects
            .filter(inspector_name__iexact=full_name, inspector_id__isnull=False)
            .values_list('inspector_id', flat=True)
            .first()
        )
        if inspector_id is None or InspectorMapping.objects.filter(inspector_id=inspector_id).exists():
            # Allocate the next free number in the local 9000+ range.
            inspector_id = 9000 + instance.pk
            while InspectorMapping.objects.filter(inspector_id=inspector_id).exists():
                inspector_id += 1
        InspectorMapping.objects.create(
            inspector_id=inspector_id,
            inspector_name=full_name,
            is_active=True,
        )
    except Exception:
        # Mapping allocation must never break a user save.
        pass
