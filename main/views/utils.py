from django.contrib import messages
from django.db.models import Q
from datetime import datetime, timedelta

def clear_messages(request):
    """Clear any existing messages from the request."""
    try:
        storage = messages.get_messages(request)
        for message in storage:
            pass
        if hasattr(storage, 'used'):
            storage.used = True
    except Exception:
        # Ignore errors in message clearing
        pass

def apply_filters(request, queryset):
    """Apply filters to the queryset based on request parameters."""
    # Get filter parameters from request
    claim_no = request.GET.get('claim_no', '').strip()
    client_reference = request.GET.get('client_reference', '').strip()
    client_id = request.GET.get('client')
    branch = request.GET.get('branch', '').strip()
    intend_date_from = request.GET.get('intend_date_from', '').strip()
    intend_date_to = request.GET.get('intend_date_to', '').strip()
    formal_date_from = request.GET.get('formal_date_from', '').strip()
    formal_date_to = request.GET.get('formal_date_to', '').strip()
    
    # Apply filters
    if claim_no:
        queryset = queryset.filter(Claim_No__icontains=claim_no)
    
    if client_reference:
        queryset = queryset.filter(Client_Reference__icontains=client_reference)
    
    if client_id:
        queryset = queryset.filter(client_id=client_id)
    
    if branch:
        queryset = queryset.filter(Branch__icontains=branch)
    
    if intend_date_from:
        try:
            date_obj = datetime.strptime(intend_date_from, '%Y-%m-%d').date()
            queryset = queryset.filter(Intend_Claim_Date__gte=date_obj)
        except ValueError:
            pass
    
    if intend_date_to:
        try:
            date_obj = datetime.strptime(intend_date_to, '%Y-%m-%d').date()
            queryset = queryset.filter(Intend_Claim_Date__lte=date_obj)
        except ValueError:
            pass
    
    if formal_date_from:
        try:
            date_obj = datetime.strptime(formal_date_from, '%Y-%m-%d').date()
            queryset = queryset.filter(Formal_Claim_Date_Received__gte=date_obj)
        except ValueError:
            pass
    
    if formal_date_to:
        try:
            date_obj = datetime.strptime(formal_date_to, '%Y-%m-%d').date()
            queryset = queryset.filter(Formal_Claim_Date_Received__lte=date_obj)
        except ValueError:
            pass
    
    return queryset


# ---------------------------------------------------------------------------
#  Outstanding COAs — ONE definition, used everywhere
# ---------------------------------------------------------------------------
# Lab Analytics and the Analytics > Timelines backlog used to count this
# separately and disagreed (43 vs 20): Timelines skipped Corporate Store
# groups, Lab Analytics also accepted a Lab Form as "done" and credited a COA
# uploaded against a duplicate client+date group. Both now call this.
#
# The rule, deliberately plain: a job where a sample was taken and the COA has
# not come back yet.
#   * counted per inspection group (one visit = one COA), not per product
#   * a sample must have been taken - nothing to await otherwise
#   * occurrence reports are not lab work
#   * EGGS and POULTRY are not composition-tested, so they never await a COA
#   * only 'coa'/'lab' documents close it. A Lab Form is the form sent TO the
#     lab, not the result back, so it does NOT count as the COA arriving.
#   * Corporate Store groups ARE included: the lab still owes that COA.

COA_DOCUMENT_TYPES = ['coa', 'lab']
COA_EXEMPT_COMMODITIES = ['EGGS', 'POULTRY']


def outstanding_coa_groups(date_from=None, date_to=None, lab_keys=None, commodity=None):
    """InspectionGroups that still owe a COA. Returns a queryset, so callers
    can .count() it or list it."""
    from django.db.models import Exists, OuterRef
    from ..models import (
        InspectionGroup as _G,
        FoodSafetyAgencyInspection as _I,
        InspectionDocument as _D,
    )

    awaiting = _I.objects.filter(
        inspection_group_id=OuterRef('pk'),
        is_sample_taken=True,
        is_occurrence_report=False,
    ).exclude(commodity__in=COA_EXEMPT_COMMODITIES)

    if lab_keys:
        awaiting = awaiting.filter(lab__in=lab_keys)
    if commodity:
        awaiting = awaiting.filter(commodity=commodity)

    qs = _G.objects.filter(Exists(awaiting))
    if date_from:
        qs = qs.filter(date_of_inspection__gte=date_from)
    if date_to:
        qs = qs.filter(date_of_inspection__lte=date_to)

    return qs.exclude(Exists(_D.objects.filter(
        inspection__inspection_group_id=OuterRef('pk'),
        document_type__in=COA_DOCUMENT_TYPES,
    )))
