"""Weekly Inspectorate Performance Report.

Management report requested by the APS Department: previous completed week
(Monday 00:00 - Sunday 23:59), per inspector, every table ranked highest to
lowest with the ranking basis stated. Reuses the existing data sources:
QuarterlyTarget for targets, is_product_compliant for compliance (measured
over ALL of the inspector's records — every commodity counts, and a record
with no recorded outcome cannot count as compliant), capture/approval
timestamps for administration tracking, and InspectionGroup hours/km for
travel.

Financial data (revenue, cost, profit per inspector) is included ONLY in the
`monthly_financials` block, which the endpoint returns for the management-only
Manager Report. It is management-confidential and never shown to inspectors.
"""
import datetime

from django.db.models import Count, F, Min, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..models import (
    Client,
    FoodSafetyAgencyInspection,
    InspectionDocument,
    InspectionFee,
    InspectionGroup,
    InspectorSalary,
    QuarterlyTarget,
)
from ..services.kpi_email_service import get_quarter_bounds

# An inspection must be captured/approved within this many days (site standard)
ADMIN_LAG_DAYS = 2
# A sample without a COA result older than this is overdue at the lab
SAMPLE_OVERDUE_DAYS = 7

VIEW_ROLES = ('super_admin', 'developer', 'admin', 'inspector_manager', 'inspector')


# Expected turnaround per stage, in days. Approval and COA reuse the standards
# already applied elsewhere in this report; doc-send and invoice are a starting
# point for the APS department to confirm.
# Turnaround stages, in the order of Nicole's requirement list. Targets are a
# starting point for the APS department to confirm; None = no target agreed yet
# (shown as "—" rather than an invented figure). Section 6 separately reports the
# capture->invoice-UPLOAD activity metric; the 'invoice' stage here is the
# document-submission -> invoicing time (sent -> invoice) from her list.
TURNAROUND_TARGETS = {'send_docs': 3, 'invoice': None, 'sample_to_coa': 7, 'approval': ADMIN_LAG_DAYS}

TURNAROUND_LABELS = {
    'send_docs': 'Inspection to documents sent',
    # Capture -> invoice upload. True document-submission -> invoicing (sent ->
    # invoice) can't be computed reliably here: invoices are usually uploaded
    # before or without a recorded send date, so that gap is empty for almost
    # every invoice. Capture -> invoice has full data both weeks.
    'invoice': 'Inspection to invoice uploaded',
    'sample_to_coa': 'Sample to COA received',
    'approval': 'Capture to approval',
}


def _as_date(value):
    return value.date() if isinstance(value, datetime.datetime) else value


def _turnaround(start, end):
    """Average days for each back-office stage over inspections in [start, end].

    Requested 2026-08-06: managers were seeing volumes but not how long work
    sits between inspection, document dispatch, invoicing, COA and approval —
    so bottlenecks and the department responsible were invisible.

    Reads invoice TIMING only. No amount, rate or revenue column is selected,
    keeping this report free of financial data like the rest of the file.
    """
    groups = list(
        InspectionGroup.objects
        .filter(date_of_inspection__gte=start, date_of_inspection__lte=end)
        .exclude(group_type='Corporate Store')  # corporate handled centrally
        .values('id', 'date_of_inspection')
    )
    # Invoicing is a monthly batch (see _admin_throughput for the invoice COUNT),
    # so it isn't a per-inspection "days" step and is left out of this table.
    _cohort = ('send_docs', 'sample_to_coa', 'approval')
    if not groups:
        return {k: {'avg': None, 'count': 0} for k in _cohort}
    gids = [g['id'] for g in groups]
    gdate = {g['id']: g['date_of_inspection'] for g in groups}

    state = {}
    for r in FoodSafetyAgencyInspection.objects.filter(
        inspection_group_id__in=gids
    ).values('inspection_group_id', 'approved_status', 'approved_date',
             'sent_date', 'is_sample_taken', 'created_at', 'coa_uploaded_date'):
        s = state.setdefault(r['inspection_group_id'],
                             {'approved': None, 'sent': None, 'sampled': False, 'captured': None, 'coa': None})
        if r['approved_status'] == 'APPROVED' and r['approved_date']:
            if s['approved'] is None or r['approved_date'] < s['approved']:
                s['approved'] = r['approved_date']
        if r['sent_date'] and (s['sent'] is None or r['sent_date'] < s['sent']):
            s['sent'] = r['sent_date']
        if r['is_sample_taken']:
            s['sampled'] = True
        if r['created_at'] and (s['captured'] is None or r['created_at'] < s['captured']):
            s['captured'] = r['created_at']
        # COA upload is recorded on the inspection (coa_uploaded_date), not as a
        # 'coa' InspectionDocument — recent uploads use the 'lab' type instead.
        if r['coa_uploaded_date'] and (s['coa'] is None or r['coa_uploaded_date'] < s['coa']):
            s['coa'] = r['coa_uploaded_date']

    buckets = {k: [] for k in _cohort}
    for gid, inspected in gdate.items():
        s = state.get(gid, {})
        pairs = {
            'send_docs': (inspected, s.get('sent')),
            'sample_to_coa': (inspected, s.get('coa')) if s.get('sampled') else (None, None),
            'approval': (s.get('captured'), s.get('approved')),
        }
        for key, (a, b) in pairs.items():
            a, b = _as_date(a), _as_date(b)
            if a and b and (b - a).days >= 0:
                buckets[key].append((b - a).days)

    return {
        key: {
            'avg': round(sum(v) / len(v), 1) if v else None,
            'count': len(v),
        }
        for key, v in buckets.items()
    }


def _admin_throughput(cur_start, cur_end, prev_start, prev_end):
    """Administration activity this period versus the previous one.

    Requested 2026-08-07:
      - how many reports were SENT this week vs last,
      - how many INVOICES were uploaded this week vs last,
      - how many COAs were uploaded this week vs last,
      - who did the most sending, and
      - the average CAPTURE -> INVOICE-UPLOAD time.

    Everything is counted by WHEN THE ACTION HAPPENED (sent_date / uploaded_date),
    so it measures what the office actually got through in the week — not the age
    of the underlying inspections. Timing only; no invoice amounts are read.
    """
    from collections import Counter

    def sends(a, b):
        # One "send" = one inspection group dispatched. sent_date/sent_by live on
        # the child records, so collapse to the group and keep its sender.
        pairs = (FoodSafetyAgencyInspection.objects
                 .filter(sent_date__date__gte=a, sent_date__date__lte=b)
                 .exclude(inspection_group__group_type='Corporate Store')
                 .values_list('inspection_group_id', 'sent_by_name'))
        seen = {}
        for gid, name in pairs:
            if gid is not None and gid not in seen:
                seen[gid] = (name or '').strip() or 'Unknown'
        return seen

    def invoices(a, b):
        # Invoice uploads are stamped on the inspection (invoice_uploaded_date);
        # the 'invoice' document type is legacy and misses recent uploads — the
        # same situation as COAs (coa_uploaded_date).
        return (FoodSafetyAgencyInspection.objects
                .filter(invoice_uploaded_date__date__gte=a, invoice_uploaded_date__date__lte=b)
                .exclude(inspection_group__group_type='Corporate Store')
                .count())

    def approvals(a, b):
        # Jobs approved in the period, by approval date (one count per group).
        return (FoodSafetyAgencyInspection.objects
                .filter(approved_status='APPROVED', approved_date__date__gte=a, approved_date__date__lte=b)
                .exclude(inspection_group__group_type='Corporate Store')
                .values('inspection_group_id').distinct().count())

    def coas(a, b):
        # COA uploads are stamped on the inspection (coa_uploaded_date); the
        # 'coa' document type is legacy and misses recent uploads.
        return (FoodSafetyAgencyInspection.objects
                .filter(coa_uploaded_date__date__gte=a, coa_uploaded_date__date__lte=b)
                .exclude(inspection_group__group_type='Corporate Store')
                .count())

    def lab_results(a, b):
        # Of the samples TAKEN in [a, b] (each needs a lab result), how many have
        # a COA back. This answers "out of the X we needed this week, how many
        # are done" — the denominator changes week to week with sample volume.
        q = (FoodSafetyAgencyInspection.objects
             .filter(date_of_inspection__gte=a, date_of_inspection__lte=b, is_sample_taken=True)
             .exclude(inspection_group__group_type='Corporate Store'))
        needed = q.count()
        back = q.filter(coa_uploaded_date__isnull=False).count()
        return {'needed': needed, 'back': back}

    def invoice_gaps(a, b):
        # For invoices uploaded in [a, b], the days from (i) the INSPECTION DATE
        # (when the inspection actually happened) and (ii) the group's document
        # submission (sent_date) to the invoice upload. Inspection date is the
        # real "capture" point the finance team cares about, not created_at
        # (system entry). sent_date is resolved at the GROUP level.
        rows = list(FoodSafetyAgencyInspection.objects
                    .filter(invoice_uploaded_date__date__gte=a, invoice_uploaded_date__date__lte=b)
                    .exclude(inspection_group__group_type='Corporate Store')
                    .values_list('invoice_uploaded_date', 'inspection_group_id', 'date_of_inspection'))
        gids = {g for _, g, _ in rows if g is not None}
        sent_map = {}
        for gid, sd in (FoodSafetyAgencyInspection.objects
                        .filter(inspection_group_id__in=gids, sent_date__isnull=False)
                        .values_list('inspection_group_id', 'sent_date')):
            if gid is not None and (gid not in sent_map or sd < sent_map[gid]):
                sent_map[gid] = sd
        cap_days, sub_days = [], []
        for up, gid, doi in rows:
            if up and doi:
                d = (up.date() - doi).days   # date_of_inspection is a date
                if d >= 0:
                    cap_days.append(d)
            sd = sent_map.get(gid)
            if up and sd:
                d = (up.date() - sd.date()).days
                if d >= 0:
                    sub_days.append(d)
        _avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None
        return (_avg(cap_days), len(cap_days)), (_avg(sub_days), len(sub_days))

    cur_sent, prev_sent = sends(cur_start, cur_end), sends(prev_start, prev_end)
    (cur_avg, cur_n), (cur_sub, cur_sub_n) = invoice_gaps(cur_start, cur_end)
    (prev_avg, _pn), (prev_sub, _psn) = invoice_gaps(prev_start, prev_end)
    cur_counts = Counter(cur_sent.values())
    prev_counts = Counter(prev_sent.values())

    from django.db.models import Exists as _Ex2, OuterRef as _OR2

    def invoice_completion(a, b):
        # Of the RAW/PMP jobs inspected in [a, b], how many are invoiced.
        # ONLY Raw meat and PMP are billed — poultry and eggs are not invoiced,
        # so they are excluded entirely (a job counts if it has a RAW or PMP
        # inspection). Counted per job. Also returns the specific jobs still
        # needing an invoice, so the finance team can chase them.
        from django.db.models import Min as _Min2
        needed = (InspectionGroup.objects.exclude(group_type='Corporate Store')
                  .filter(_Ex2(FoodSafetyAgencyInspection.objects.filter(
                      inspection_group_id=_OR2('pk'),
                      date_of_inspection__gte=a, date_of_inspection__lte=b,
                      commodity__in=['RAW', 'PMP']))))
        has_inv = _Ex2(FoodSafetyAgencyInspection.objects.filter(
            inspection_group_id=_OR2('pk'), invoice_uploaded_date__isnull=False))
        req = needed.count()
        done = needed.filter(has_inv).count()
        _today = datetime.date.today()
        todo = [
            {'client': g.client_name or 'Unknown',
             'date': g.insp.isoformat() if g.insp else None,
             'age': (_today - g.insp).days if g.insp else None}
            for g in needed.exclude(has_inv).annotate(insp=_Min2('inspections__date_of_inspection')).order_by('insp')
        ]
        return {'needed': req, 'done': done, 'todo': todo}

    # Live "awaiting COA" backlog — MUST match the Lab Analytics page's number.
    # A group counts if it has a sampled, non-occurrence, non-EGGS/POULTRY
    # inspection AND has no COA/lab document (checked by group, or by
    # client_name + date for duplicated records). Field coa_uploaded_date alone
    # is unreliable (often blank even when a COA document exists).
    from django.db.models import Exists, OuterRef
    _coa_groups = InspectionGroup.objects.filter(
        Exists(FoodSafetyAgencyInspection.objects.filter(
            inspection_group_id=OuterRef('pk'),
            is_sample_taken=True, is_occurrence_report=False,
        ).exclude(commodity__in=['EGGS', 'POULTRY']))
    )
    _coa_doc = Exists(InspectionDocument.objects.filter(
        Q(inspection__inspection_group_id=OuterRef('pk'))
        | Q(inspection__client_name=OuterRef('client_name'),
            inspection__date_of_inspection=OuterRef('date_of_inspection')),
        document_type__in=['coa', 'lab', 'lab_form'],
    ))
    samples_at_lab = _coa_groups.exclude(_coa_doc).count()

    return {
        'sent': {'count': len(cur_sent), 'prev': len(prev_sent)},
        'invoices_uploaded': {
            'count': invoices(cur_start, cur_end),
            'prev': invoices(prev_start, prev_end),
        },
        'coas_uploaded': {
            'count': coas(cur_start, cur_end),
            'prev': coas(prev_start, prev_end),
        },
        # Of the samples taken that week (each needs a lab result), how many are
        # back — so "X of Y (%)" reflects the actual demand that week.
        'lab_results': {
            'cur': lab_results(cur_start, cur_end),
            'prev': lab_results(prev_start, prev_end),
        },
        'approvals_done': {
            'count': approvals(cur_start, cur_end),
            'prev': approvals(prev_start, prev_end),
        },
        # Live "awaiting COA" backlog — same logic/number as the Lab Analytics page.
        'samples_at_lab': samples_at_lab,
        'invoice_time': {'avg': cur_avg, 'prev_avg': prev_avg, 'count': cur_n},
        # Of the jobs inspected each week that need an invoice, how many are done.
        'invoice_completion': {
            'cur': invoice_completion(cur_start, cur_end),
            'prev': invoice_completion(prev_start, prev_end),
        },
        # Everyone who sent in EITHER week, so someone who dropped to 0 last week
        # (e.g. sent 36 the week before) is still visible. Sorted by last week,
        # then the week before.
        'top_senders': [
            {'name': n, 'count': cur_counts.get(n, 0), 'prev': prev_counts.get(n, 0)}
            for n in sorted(set(cur_counts) | set(prev_counts),
                            key=lambda n: (-cur_counts.get(n, 0), -prev_counts.get(n, 0), n))[:10]
        ],
    }


def _outstanding_backlog():
    """The whole current backlog — every inspection JOB not yet fully completed,
    grouped by the stage it is stuck at. Not limited to the report week: this is
    the operational to-do list across all jobs (requested 2026-08-07).

    Counted per InspectionGroup (a job / site visit), NOT per commodity record.
    Uses the SAME group-level signals as the Inspection Records list so the two
    always agree: first_approved / first_sent (the job's status shown there),
    has_invoice / has_coa (a document exists). Office flow (approval -> send ->
    invoice) is a waterfall — each job counts once, at its next office step. COA
    is the parallel lab queue (any sampled job with no result yet). Occurrence
    reports and corporate-store jobs are excluded from this backlog (occurrences
    are outside the flow; corporate stores are handled/invoiced centrally).
    """
    from django.db.models import Subquery, OuterRef, Exists
    _insp = FoodSafetyAgencyInspection.objects.filter(inspection_group_id=OuterRef('pk'))
    _inv_doc = InspectionDocument.objects.filter(
        inspection__inspection_group_id=OuterRef('pk'), document_type='invoice')
    _coa_doc = InspectionDocument.objects.filter(
        inspection__inspection_group_id=OuterRef('pk'), document_type__in=['coa', 'lab'])
    groups = InspectionGroup.objects.annotate(
        first_approved=Subquery(_insp.order_by('id').values('approved_status')[:1]),
        first_sent=Subquery(_insp.order_by('id').values('sent_date')[:1]),
        is_occ=Exists(_insp.filter(is_occurrence_report=True)),
        is_sampled=Exists(_insp.filter(is_sample_taken=True)),
        has_invoice=Exists(_inv_doc),
        has_coa=Exists(_coa_doc),
        # Only PMP and RAW commodities are invoiced/RFI'd. A job that is only
        # poultry and/or eggs never needs an invoice.
        is_billable=Exists(_insp.filter(commodity__in=['PMP', 'RAW'])),
    ).values('group_type', 'first_approved', 'first_sent', 'is_occ',
             'is_sampled', 'has_invoice', 'has_coa', 'is_billable')

    counts = {'approval': 0, 'not_sent': 0, 'invoice': 0}
    needs_coa = 0
    fully = 0
    total = 0
    for g in groups:
        if g['is_occ'] or g['group_type'] == 'Corporate Store':
            continue  # occurrence reports and corporate-store jobs are outside this backlog
        total += 1
        coa_ok = (not g['is_sampled']) or g['has_coa']
        # Invoice needed only for PMP/RAW jobs.
        invoice_ok = g['has_invoice'] or (not g['is_billable'])
        if g['is_sampled'] and not g['has_coa']:
            needs_coa += 1
        if g['first_approved'] != 'APPROVED':
            counts['approval'] += 1
        elif not g['first_sent']:
            counts['not_sent'] += 1
        elif not invoice_ok:
            counts['invoice'] += 1
        elif coa_ok:
            fully += 1
    return {
        'needs_approval': counts['approval'],
        'not_sent': counts['not_sent'],
        'needs_invoice': counts['invoice'],
        'needs_coa': needs_coa,
        'complete': fully,
        'outstanding_total': total - fully,
        'total': total,
    }


def _non_inspector_names():
    """Names belonging to non-inspector users plus known junk entries."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    names = {'', 'Unknown', 'API User'}
    for u in User.objects.exclude(role__in=['inspector', 'inspector_manager']):
        if u.first_name:
            names.add(u.first_name)
        if u.last_name:
            names.add(u.last_name)
        full = f"{u.first_name} {u.last_name}".strip()
        if full:
            names.add(full)
        if u.username:
            names.add(u.username)
    return names


def _inspector_roster():
    """Full names of everyone who SHOULD be doing inspections (inspector-role
    users), so the manager report can show inspectors who did zero work — that
    silence is exactly what a manager needs to see, not hide."""
    from django.contrib.auth import get_user_model
    User = get_user_model()
    names = []
    seen = set()
    for u in User.objects.filter(role__in=['inspector', 'inspector_manager'], is_active=True):
        full = f"{u.first_name} {u.last_name}".strip() or u.username
        key = full.strip().lower()
        if full and key not in seen:
            seen.add(key)
            names.append(full)
    return names


def _month_financials(month_start, month_end, excl):
    """Per-inspector revenue / cost / profit for the WHOLE calendar month.

    MANAGEMENT-ONLY. Mirrors the Revenue Per Inspector page's formula:
      revenue = hours*hour_rate + km*km_rate + samples*sample_rate
      cost    = one full month's salary + 20% management fee
      profit  = revenue - cost
    Covers the full calendar month (month_start = 1st, month_end = last day) so
    a full month of revenue is compared against a full month of salary — a real
    profit picture, not skewed by a partial month.
    Rates come from InspectionFee (same fallbacks as the analytics endpoint);
    salary from InspectorSalary. Corporate/occurrence are NOT excluded from
    revenue here — inspectors still bill hours/km on those, same as Analytics.
    """
    fee = {f.fee_code: float(f.rate) for f in InspectionFee.objects.all()}
    hour_rate = fee.get('inspection_hour_rate', 540.60)
    km_rate = fee.get('inspection_km_rate', fee.get('travel_rate_per_km', 6.50))
    sample_rate = fee.get('sample_collection', 0)

    base = Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl)

    # hours + km from the inspection groups in range
    grp = {}
    for r in InspectionGroup.objects.filter(
        date_of_inspection__gte=month_start, date_of_inspection__lte=month_end,
    ).exclude(base).values('inspector_name').annotate(
        hrs=Sum('hours'), km=Sum('km_traveled'),
    ):
        grp[r['inspector_name']] = {'hrs': float(r['hrs'] or 0), 'km': float(r['km'] or 0)}

    # inspections + samples from the per-commodity rows in range
    insp = {}
    for r in FoodSafetyAgencyInspection.objects.filter(
        date_of_inspection__gte=month_start, date_of_inspection__lte=month_end,
    ).exclude(base).values('inspector_name').annotate(
        n=Count('id'), samples=Count('id', filter=Q(is_sample_taken=True)),
    ):
        insp[r['inspector_name']] = {'n': r['n'], 'samples': r['samples']}

    salaries = {s.inspector_name.strip().lower(): float(s.monthly_salary)
                for s in InspectorSalary.objects.all()}

    def lookup_salary(name):
        n = name.strip().lower()
        if n in salaries:
            return salaries[n]
        parts = name.split()
        if len(parts) > 1 and parts[-1].lower() in salaries:
            return salaries[parts[-1].lower()]
        if parts and parts[0].lower() in salaries:
            return salaries[parts[0].lower()]
        return 0.0

    # An idle-but-still-employed inspector still costs us their salary, so they
    # must show as a LOSS that month, not vanish. "Still employed" = they are an
    # active user account (someone who has left is deactivated). We only start
    # charging them from the month they FIRST did work (so we don't back-date a
    # salary before they joined).
    from django.contrib.auth import get_user_model
    _User = get_user_model()
    active_names = set()
    for u in _User.objects.filter(role__in=['inspector', 'inspector_manager'], is_active=True):
        full = f"{u.first_name} {u.last_name}".strip()
        if full:
            active_names.add(full.lower())

    first_active = {}
    for r in FoodSafetyAgencyInspection.objects.exclude(base).values('inspector_name').annotate(f=Min('date_of_inspection')):
        if r['f']:
            first_active[r['inspector_name']] = r['f']

    def still_employed_this_month(name):
        if lookup_salary(name) <= 0:
            return False
        if name.strip().lower() not in active_names:   # deactivated → they left
            return False
        first = first_active.get(name)
        return bool(first and first <= month_end)      # only from when they started

    # Names to show: anyone with work this month, plus still-employed salaried
    # inspectors (so a zero-work month shows their salary cost as a loss).
    names = set(grp.keys()) | set(insp.keys())
    for sal_name in FoodSafetyAgencyInspection.objects.exclude(base).values_list('inspector_name', flat=True).distinct():
        if sal_name and still_employed_this_month(sal_name):
            names.add(sal_name)

    rows = []
    for name in names:
        g = grp.get(name, {})
        it = insp.get(name, {})
        hrs = g.get('hrs', 0.0)
        km = g.get('km', 0.0)
        samples = it.get('samples', 0)
        revenue = round(hrs * hour_rate + km * km_rate + samples * sample_rate, 2)
        salary = lookup_salary(name)          # one full month
        cost = round(salary * 1.20, 2)        # + 20% management fee
        profit = round(revenue - cost, 2)
        rev_per_hr = round(revenue / hrs) if hrs > 0 else 0
        rows.append({
            'inspector_name': name,
            'inspections': it.get('n', 0),
            'hours': round(hrs, 1),
            'revenue': revenue,
            'cost': cost,
            'profit': profit,
            'rev_per_hr': rev_per_hr,
        })
    rows.sort(key=lambda r: -r['profit'])
    today = datetime.date.today()
    return {
        'rows': rows,
        'month': month_start.strftime('%Y-%m'),
        'month_label': month_start.strftime('%B %Y'),
        'partial': month_end >= today,   # the month is not finished yet
        'total_revenue': round(sum(r['revenue'] for r in rows), 2),
        'total_cost': round(sum(r['cost'] for r in rows), 2),
        'total_profit': round(sum(r['profit'] for r in rows), 2),
    }


def _month_financials_series(anchor_end, excl, n=6):
    """Revenue/cost/profit per inspector for each of the last `n` calendar
    months (newest first), each a full-month _month_financials() result. Used
    by the Manager Report's month-by-month Revenue & Profit section."""
    # First-of-month for the month the reporting week falls in
    first = anchor_end.replace(day=1)
    firsts = []
    f = first
    for _ in range(n):
        firsts.append(f)
        f = (f - datetime.timedelta(days=1)).replace(day=1)  # step back one month
    out = []
    for m_start in firsts:  # already newest-first
        if m_start.month == 12:
            nxt = m_start.replace(year=m_start.year + 1, month=1)
        else:
            nxt = m_start.replace(month=m_start.month + 1)
        m_end = nxt - datetime.timedelta(days=1)
        out.append(_month_financials(m_start, m_end, excl))
    return out


# Finance/efficiency report stage targets (days). Unlike the manager report
# (where invoice has no agreed target), Speed to Cash needs a yardstick, so each
# stage gets a starting target the APS department can tune later.
FINANCE_STAGE_TARGETS = {'approval': 2, 'send_docs': 3, 'invoice': 7, 'sample_to_coa': 7}
FINANCE_STAGE_LABELS = {
    'approval': 'Inspection to approval',
    'send_docs': 'Inspection to documents sent',
    'invoice': 'Inspection to invoice (speed to cash)',
    'sample_to_coa': 'Sample to COA received',
}


def _finance_efficiency(week_start, week_end, prev_start, prev_end):
    """Efficiency + money view for the finance report. Measures the four back-
    office turnaround stages by WHEN THEY WERE COMPLETED in the week (matching
    the Analytics 'Timelines' tab), the Rand invoiced this week, and the Rand
    still sitting uninvoiced. MANAGEMENT-ONLY (reads revenue)."""
    fee = {f.fee_code: float(f.rate) for f in InspectionFee.objects.all()}
    hour_rate = fee.get('inspection_hour_rate', 540.60)
    km_rate = fee.get('inspection_km_rate', fee.get('travel_rate_per_km', 6.50))
    sample_rate = fee.get('sample_collection', 0)
    corp = Q(inspection_group__group_type='Corporate Store')

    # Four turnaround stages, measured by completion date falling in [a, b] — i.e.
    # what the office/finance/lab actually cleared that week, and how fast, from
    # the inspection date. Same deltas as the Analytics 'Timelines' tab.
    _STAGES = {
        'approval':      ('approved_date',         {'approved_status': 'APPROVED'}),
        'send_docs':     ('sent_date',             {'is_sent': True}),
        'invoice':       ('invoice_uploaded_date', {}),
        'sample_to_coa': ('coa_uploaded_date',     {'is_sample_taken': True}),
    }

    def _stage(field, extra, a, b):
        flt = {f'{field}__date__gte': a, f'{field}__date__lte': b, **extra}
        days = []
        for r in (FoodSafetyAgencyInspection.objects.filter(**flt)
                  .exclude(corp).exclude(date_of_inspection__isnull=True)
                  .values('date_of_inspection', field)):
            comp = r[field]
            comp = comp.date() if isinstance(comp, datetime.datetime) else comp
            d = (comp - r['date_of_inspection']).days
            if d >= 0:
                days.append(d)
        days.sort()
        n = len(days)
        return {'avg': round(sum(days) / n, 1) if n else None,
                'median': days[n // 2] if n else None, 'count': n}

    timeliness = {}
    for key, (field, extra) in _STAGES.items():
        cur = _stage(field, extra, week_start, week_end)
        prev = _stage(field, extra, prev_start, prev_end)
        timeliness[key] = {
            **cur, 'prev_avg': prev['avg'], 'prev_count': prev['count'],
            'target': FINANCE_STAGE_TARGETS[key], 'label': FINANCE_STAGE_LABELS[key],
        }

    # Rand invoiced this week vs last — revenue of the jobs invoiced in the week.
    def _revenue_invoiced(a, b):
        gids = set(FoodSafetyAgencyInspection.objects
                   .filter(invoice_uploaded_date__date__gte=a, invoice_uploaded_date__date__lte=b)
                   .exclude(corp).values_list('inspection_group_id', flat=True))
        gids.discard(None)
        if not gids:
            return {'rand': 0.0, 'jobs': 0}
        hk = InspectionGroup.objects.filter(id__in=gids).aggregate(h=Sum('hours'), k=Sum('km_traveled'))
        s = FoodSafetyAgencyInspection.objects.filter(inspection_group_id__in=gids, is_sample_taken=True).count()
        rand = float(hk['h'] or 0) * hour_rate + float(hk['k'] or 0) * km_rate + s * sample_rate
        return {'rand': round(rand, 2), 'jobs': len(gids)}

    # Rand still uninvoiced: RAW/PMP jobs sent but not invoiced (same definition
    # as billing_backlog), plus the slice older than 14 days.
    from django.db.models import Exists as _Ex, OuterRef as _OR, Min as _Min
    _today = datetime.date.today()
    bl = list(InspectionGroup.objects.exclude(group_type='Corporate Store')
              .filter(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), commodity__in=['RAW', 'PMP'])))
              .filter(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), sent_date__isnull=False)))
              .exclude(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), invoice_uploaded_date__isnull=False)))
              .annotate(insp=_Min('inspections__date_of_inspection'))
              .values('id', 'hours', 'km_traveled', 'insp'))
    bl_gids = [r['id'] for r in bl]
    samples_by_group = {}
    if bl_gids:
        for r in (FoodSafetyAgencyInspection.objects
                  .filter(inspection_group_id__in=bl_gids, is_sample_taken=True)
                  .values('inspection_group_id').annotate(n=Count('id'))):
            samples_by_group[r['inspection_group_id']] = r['n']
    unbilled_rand = unbilled_aged_rand = 0.0
    unbilled_aged_jobs = 0
    for r in bl:
        rev = (float(r['hours'] or 0) * hour_rate + float(r['km_traveled'] or 0) * km_rate
               + samples_by_group.get(r['id'], 0) * sample_rate)
        unbilled_rand += rev
        age = (_today - r['insp']).days if r['insp'] else None
        if age is not None and age > 14:
            unbilled_aged_rand += rev
            unbilled_aged_jobs += 1

    return {
        'timeliness': timeliness,
        'speed_to_cash': timeliness['invoice'],
        'invoiced_week': _revenue_invoiced(week_start, week_end),
        'invoiced_prev': _revenue_invoiced(prev_start, prev_end),
        'unbilled': {
            'rand': round(unbilled_rand, 2), 'jobs': len(bl),
            'aged_rand': round(unbilled_aged_rand, 2), 'aged_jobs': unbilled_aged_jobs,
        },
        'rates': {'hour': hour_rate, 'km': km_rate, 'sample': sample_rate},
    }


def _monday(d):
    return d - datetime.timedelta(days=d.weekday())


def _parse_range(request):
    """?date_from=&date_to= (any range). Default: the previous completed
    Monday–Sunday week, per the report specification."""
    def _d(name):
        raw = (request.GET.get(name) or '').strip()
        try:
            return datetime.date.fromisoformat(raw) if raw else None
        except ValueError:
            return None

    date_from, date_to = _d('date_from'), _d('date_to')
    if date_from and date_to and date_from <= date_to:
        return date_from, date_to
    week_start = _monday(datetime.date.today()) - datetime.timedelta(days=7)
    return week_start, week_start + datetime.timedelta(days=6)


def _week_qs(week_start, week_end, excl):
    return FoodSafetyAgencyInspection.objects.filter(
        date_of_inspection__gte=week_start, date_of_inspection__lte=week_end,
    ).exclude(Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl))


def _per_inspector(week_start, week_end, excl):
    overdue_cutoff = datetime.date.today() - datetime.timedelta(days=SAMPLE_OVERDUE_DAYS)
    rows = _week_qs(week_start, week_end, excl).values('inspector_name').annotate(
        inspections=Count('id'),
        compliant=Count('id', filter=Q(is_product_compliant=True)),
        non_compliant=Count('id', filter=Q(is_product_compliant=False)),
        approved=Count('id', filter=Q(approved_status='APPROVED')),
        pending=Count('id', filter=~Q(approved_status='APPROVED')),
        occurrences=Count('id', filter=Q(is_occurrence_report=True)),
        samples=Count('id', filter=Q(is_sample_taken=True)),
        samples_completed=Count('id', filter=Q(is_sample_taken=True, coa_uploaded_date__isnull=False)),
        samples_overdue=Count('id', filter=Q(
            is_sample_taken=True, coa_uploaded_date__isnull=True,
            date_of_inspection__lt=overdue_cutoff,
        )),
        captured_on_time=Count('id', filter=Q(
            created_at__isnull=False,
            created_at__date__lte=F('date_of_inspection') + datetime.timedelta(days=ADMIN_LAG_DAYS),
        )),
    )
    return {r['inspector_name']: r for r in rows}


def _rank_map(stats, key):
    """name -> rank (1 = highest) ranked by `key` descending."""
    ordered = sorted(stats.values(), key=lambda r: (-r.get(key, 0), r['inspector_name'].lower()))
    return {r['inspector_name']: i + 1 for i, r in enumerate(ordered)}


@csrf_exempt
def api_weekly_report(request):
    # Server-to-server access for the automatic Monday email (PDF generation).
    from django.conf import settings as dj_settings
    internal_key = getattr(dj_settings, 'WEEKLY_INTERNAL_KEY', '')
    if internal_key and request.headers.get('X-Internal-Key') == internal_key:
        pass
    elif not request.user.is_authenticated:
        return JsonResponse({'success': False, 'error': 'Not authenticated'}, status=401)
    elif getattr(request.user, 'role', '') not in VIEW_ROLES:
        return JsonResponse({'success': False, 'error': 'Not authorised'}, status=403)

    excl = _non_inspector_names()
    week_start, week_end = _parse_range(request)
    # Previous period = the same number of days immediately before the range
    period_days = (week_end - week_start).days + 1
    prev_end = week_start - datetime.timedelta(days=1)
    prev_start = prev_end - datetime.timedelta(days=period_days - 1)
    today = datetime.date.today()

    cur = _per_inspector(week_start, week_end, excl)
    prev = _per_inspector(prev_start, prev_end, excl)

    # ── 1. Inspection performance (rank basis: weekly inspections completed) ──
    quarter, year, q_start, q_end, _pct = get_quarter_bounds(week_end)
    cum_rows = FoodSafetyAgencyInspection.objects.filter(
        date_of_inspection__gte=q_start, date_of_inspection__lte=week_end,
    ).exclude(Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl)
    ).values('inspector_name').annotate(
        n=Count('id'),
        a=Count('id', filter=Q(approved_status='APPROVED')),
    )
    cumulative = {r['inspector_name']: r for r in cum_rows}

    targets = {}
    targets_by_commodity = {}   # name -> {POULTRY, RAW, PMP, EGGS}
    for t in QuarterlyTarget.objects.filter(year=year, quarter=quarter):
        targets[t.inspector_name] = (t.poultry or 0) + (t.raw or 0) + (t.pmp or 0) + (t.eggs or 0)
        targets_by_commodity[t.inspector_name] = {
            'POULTRY': t.poultry or 0, 'RAW': t.raw or 0,
            'PMP': t.pmp or 0, 'EGGS': t.eggs or 0,
        }

    # Done-this-quarter per inspector PER COMMODITY (for the commodity KPI table).
    cum_by_commodity = {}
    for r in (FoodSafetyAgencyInspection.objects.filter(
                date_of_inspection__gte=q_start, date_of_inspection__lte=week_end)
              .exclude(Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl))
              .exclude(Q(commodity__isnull=True) | Q(commodity=''))
              .values('inspector_name', 'commodity').annotate(n=Count('id'))):
        cum_by_commodity.setdefault(r['inspector_name'], {})[r['commodity']] = r['n']

    # Calendar-month total per inspector — the month the reporting week ends in,
    # from the 1st up to and including week_end (so "this month" tracks with the
    # report and never counts days after the reporting week).
    month_start = week_end.replace(day=1)
    month_rows = FoodSafetyAgencyInspection.objects.filter(
        date_of_inspection__gte=month_start, date_of_inspection__lte=week_end,
    ).exclude(Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl)
    ).values('inspector_name').annotate(n=Count('id'))
    monthly = {r['inspector_name']: r['n'] for r in month_rows}

    cur_rank = _rank_map(cur, 'inspections')
    prev_rank = _rank_map(prev, 'inspections')
    performance = []
    for name, r in cur.items():
        # Case-insensitive target lookup (target names are typed by hand)
        target = targets.get(name) or next(
            (v for k, v in targets.items() if k.lower() == name.lower()), 0)
        cum_r = cumulative.get(name, {})
        cum = cum_r.get('n', 0)
        cum_approved = cum_r.get('a', 0)
        month_n = monthly.get(name) or next(
            (v for k, v in monthly.items() if k.lower() == name.lower()), 0)
        performance.append({
            'inspector_name': name,
            'quarter_target': target,
            'weekly_inspections': r['inspections'],
            'prev_inspections': prev.get(name, {}).get('inspections', 0),
            'month_inspections': month_n,
            'cumulative_inspections': cum,
            'cumulative_approved': cum_approved,
            'cumulative_pending': cum - cum_approved,
            'target_pct': round(cum * 100 / target) if target else None,
            'rank': cur_rank[name],
            'rank_change': (prev_rank.get(name) - cur_rank[name]) if name in prev_rank else None,
        })
    performance.sort(key=lambda x: x['rank'])

    # ── KPI target progress PER COMMODITY — for each inspector with any target
    #    or work this quarter, target vs done-this-quarter for each commodity.
    _COMMS = ['POULTRY', 'RAW', 'PMP', 'EGGS']
    _COMM_LABEL = {'POULTRY': 'Poultry', 'RAW': 'Raw meat', 'PMP': 'PMP', 'EGGS': 'Eggs'}
    kpi_commodity = []
    _kpi_names = set(targets_by_commodity) | set(cum_by_commodity)
    for name in _kpi_names:
        # case-insensitive target lookup (target names are typed by hand)
        tgt = targets_by_commodity.get(name) or next(
            (v for k, v in targets_by_commodity.items() if k.lower() == name.lower()), {})
        done = cum_by_commodity.get(name, {})
        comms = []
        for c in _COMMS:
            t = tgt.get(c, 0)
            dn = done.get(c, 0)
            if t == 0 and dn == 0:
                continue  # nothing set and nothing done for this commodity
            comms.append({
                'commodity': _COMM_LABEL[c], 'target': t, 'done': dn,
                'pct': round(dn * 100 / t) if t else None,
            })
        if comms:
            tot_t = sum(x['target'] for x in comms)
            tot_d = sum(x['done'] for x in comms)
            kpi_commodity.append({
                'inspector_name': name,
                'commodities': comms,
                'total_target': tot_t,
                'total_done': tot_d,
                'total_pct': round(tot_d * 100 / tot_t) if tot_t else None,
            })
    kpi_commodity.sort(key=lambda r: -(r['total_pct'] if r['total_pct'] is not None else -1))

    # 8-week inspectorate trend (total inspections per week)
    trend_weeks = []
    for i in range(7, -1, -1):
        ws = week_start - datetime.timedelta(days=7 * i)
        we = ws + datetime.timedelta(days=6)
        trend_weeks.append({
            'week': ws.isoformat(),
            'inspections': _week_qs(ws, we, excl).count(),
        })

    # ── 2. Sample tracking (rank basis: samples taken this week) ──
    # Every inspector is listed — including those whose inspections had NO
    # sample taken, because that is exactly what management wants to see.
    sample_rank = _rank_map(cur, 'samples')
    samples = []
    for name, r in sorted(cur.items(), key=lambda kv: sample_rank[kv[0]]):
        outstanding = r['samples'] - r['samples_completed']
        samples.append({
            'inspector_name': name,
            'inspections': r['inspections'],
            'taken': r['samples'],
            'no_sample': r['inspections'] - r['samples'],
            'completed': r['samples_completed'],
            'waiting': outstanding - r['samples_overdue'],
            'overdue': r['samples_overdue'],
            'outstanding': outstanding,
            'rank': sample_rank[name],
        })

    outstanding_detail = []
    overdue_count = 0
    for s in _week_qs(week_start, week_end, excl).filter(
        is_sample_taken=True, coa_uploaded_date__isnull=True,
    ).values('inspector_name', 'client_name', 'date_of_inspection', 'commodity').order_by('date_of_inspection'):
        age = (today - s['date_of_inspection']).days
        overdue = age > SAMPLE_OVERDUE_DAYS
        if overdue:
            overdue_count += 1
        outstanding_detail.append({
            'inspector_name': s['inspector_name'],
            'client_name': s['client_name'] or '',
            'commodity': s['commodity'] or '',
            'sample_date': s['date_of_inspection'].isoformat(),
            'age_days': age,
            'overdue': overdue,
        })

    total_samples = sum(r['samples'] for r in cur.values())
    total_completed = sum(r['samples_completed'] for r in cur.values())
    sample_status = {
        'completed': total_completed,
        'waiting': total_samples - total_completed - overdue_count,
        'overdue': overdue_count,
    }

    # ── 3. Approval versus capturing (rank basis: approval rate) ──
    approvals = []
    for name, r in cur.items():
        total = r['inspections']
        approvals.append({
            'inspector_name': name,
            'total_records': total,
            'captured_on_time': r['captured_on_time'],
            'approved': r['approved'],
            'pending': r['pending'],
            'approval_rate': round(r['approved'] * 100 / total) if total else 0,
            'capture_rate': round(r['captured_on_time'] * 100 / total) if total else 0,
        })
    approvals.sort(key=lambda x: (-x['approval_rate'], -x['total_records'], x['inspector_name'].lower()))
    for i, row in enumerate(approvals):
        row['rank'] = i + 1

    # ── 4. Occurrence reports (rank basis: occurrence reports this week) ──
    occ_rank = _rank_map(cur, 'occurrences')
    occurrences = [
        {'inspector_name': name, 'count': r['occurrences'], 'rank': occ_rank[name]}
        for name, r in sorted(cur.items(), key=lambda kv: occ_rank[kv[0]])
        if r['occurrences'] > 0
    ]
    occurrence_detail = list(_week_qs(week_start, week_end, excl).filter(
        is_occurrence_report=True,
    ).values('inspector_name', 'client_name', 'town', 'approved_status', 'date_of_inspection', 'created_at'
    ).order_by('inspector_name', 'date_of_inspection'))
    for o in occurrence_detail:
        o['date_of_inspection'] = o['date_of_inspection'].isoformat() if o['date_of_inspection'] else None
        o['submitted'] = o.pop('created_at').date().isoformat() if o['created_at'] else None
        o['status'] = 'Approved' if o.pop('approved_status') == 'APPROVED' else 'Pending'

    # ── 5. Weekly compliance (rank basis: compliance rate over ALL of the
    # inspector's records this week — every commodity counts; a record with no
    # recorded outcome cannot count as compliant, so it pulls the rate down) ──
    # Compliance per commodity (POULTRY block, EGGS block, ...) — each block
    # carries the per-inspector breakdown for that commodity.
    comm_agg = {}
    for row in _week_qs(week_start, week_end, excl).values('commodity', 'inspector_name').annotate(
        n=Count('id'),
        c=Count('id', filter=Q(is_product_compliant=True)),
        nc=Count('id', filter=Q(is_product_compliant=False)),
    ):
        if not (row['commodity'] or '').strip():
            continue  # occurrence reports carry no commodity — not a commodity block
        key = row['commodity'].strip().upper()
        agg = comm_agg.setdefault(key, {'n': 0, 'c': 0, 'nc': 0, 'by_inspector': {}})
        agg['n'] += row['n']
        agg['c'] += row['c']
        agg['nc'] += row['nc']
        person = agg['by_inspector'].setdefault(row['inspector_name'], {'n': 0, 'c': 0, 'nc': 0})
        person['n'] += row['n']
        person['c'] += row['c']
        person['nc'] += row['nc']
    commodity_compliance = [
        {
            'commodity': key,
            'inspections': a['n'],
            'compliant': a['c'],
            'non_compliant': a['nc'],
            'not_assessed': a['n'] - a['c'] - a['nc'],
            'rate': round(a['c'] * 100 / (a['c'] + a['nc']), 1) if (a['c'] + a['nc']) else None,
            'inspectors': sorted(
                [
                    {
                        'inspector_name': name,
                        'inspections': p['n'],
                        'compliant': p['c'],
                        'non_compliant': p['nc'],
                        'not_assessed': p['n'] - p['c'] - p['nc'],
                        'rate': round(p['c'] * 100 / (p['c'] + p['nc']), 1) if (p['c'] + p['nc']) else None,
                    }
                    for name, p in a['by_inspector'].items()
                ],
                key=lambda x: (x['rate'] is None, -(x['rate'] or 0), -x['inspections'], x['inspector_name'].lower()),
            ),
        }
        for key, a in sorted(comm_agg.items(), key=lambda kv: -kv[1]['n'])
    ]

    compliance = []
    for name, r in cur.items():
        total = r['inspections']
        if total == 0:
            continue
        prev_r = prev.get(name)
        # Pass rate is measured ONLY over inspections that have a recorded result
        # (compliant or non-compliant). Records with no outcome yet are set aside —
        # they are not counted as compliant and not counted as non-compliant, so
        # they neither raise nor lower the rate (requested 2026-08-10).
        assessed = r['compliant'] + r['non_compliant']
        prev_assessed = (prev_r['compliant'] + prev_r['non_compliant']) if prev_r else 0
        prev_rate = round(prev_r['compliant'] * 100 / prev_assessed, 1) if prev_assessed else None
        rate = round(r['compliant'] * 100 / assessed, 1) if assessed else None
        compliance.append({
            'inspector_name': name,
            'inspections': total,
            'compliant': r['compliant'],
            'non_compliant': r['non_compliant'],
            'not_assessed': total - r['compliant'] - r['non_compliant'],
            'assessed': assessed,
            'rate': rate,
            'prev_rate': prev_rate,
            'change': round(rate - prev_rate, 1) if (rate is not None and prev_rate is not None) else None,
        })
    # Rank by pass rate; inspectors with no assessed results yet sort to the bottom.
    compliance.sort(key=lambda x: (x['rate'] is None, -(x['rate'] or 0), -x['inspections'], x['inspector_name'].lower()))
    for i, row in enumerate(compliance):
        row['rank'] = i + 1

    def _overall_rate(stats):
        c = sum(r['compliant'] for r in stats.values())
        nc = sum(r['non_compliant'] for r in stats.values())
        return round(c * 100 / (c + nc), 1) if (c + nc) else None

    overall_rate = _overall_rate(cur)
    prev_overall_rate = _overall_rate(prev)

    compliance_trend = []
    for i in range(7, -1, -1):
        ws = week_start - datetime.timedelta(days=7 * i)
        we = ws + datetime.timedelta(days=6)
        agg = _week_qs(ws, we, excl).aggregate(
            c=Count('id', filter=Q(is_product_compliant=True)),
            nc=Count('id', filter=Q(is_product_compliant=False)),
        )
        compliance_trend.append({
            'week': ws.isoformat(),
            'rate': round(agg['c'] * 100 / (agg['c'] + agg['nc']), 1) if (agg['c'] + agg['nc']) else None,
        })

    # ── Monthly trend (last 6 calendar months up to the reporting week) ──
    # inspections done + compliance rate per month, for the manager report's
    # month-by-month tables. The current month runs only up to week_end so it
    # lines up with the reporting period.
    monthly_trend = []
    _m_first = week_end.replace(day=1)
    _month_firsts = []
    _f = _m_first
    for _ in range(6):
        _month_firsts.append(_f)
        # step back one calendar month
        _f = (_f - datetime.timedelta(days=1)).replace(day=1)
    def _month_stats(m_start):
        """Full-month inspections + compliance rate for the calendar month
        starting m_start (capped at week_end for the current month)."""
        if m_start.month == 12:
            nxt = m_start.replace(year=m_start.year + 1, month=1)
        else:
            nxt = m_start.replace(month=m_start.month + 1)
        m_end = min(nxt - datetime.timedelta(days=1), week_end)
        agg = _week_qs(m_start, m_end, excl).aggregate(
            n=Count('id'),
            c=Count('id', filter=Q(is_product_compliant=True)),
            nc=Count('id', filter=Q(is_product_compliant=False)),
        )
        assessed = agg['c'] + agg['nc']
        return {
            'inspections': agg['n'],
            'rate': round(agg['c'] * 100 / assessed, 1) if assessed else None,
            'compliant': agg['c'], 'non_compliant': agg['nc'],
            'partial': m_end < (nxt - datetime.timedelta(days=1)),
        }

    for m_start in reversed(_month_firsts):
        st = _month_stats(m_start)
        # The calendar month BEFORE this one — used so even the first visible row
        # can show a real change vs the month before it (that earlier month is
        # not shown as its own row, only its figures are used for the comparison).
        prev_first = (m_start - datetime.timedelta(days=1)).replace(day=1)
        prev_label = prev_first.strftime('%b')
        prev_st = _month_stats(prev_first)
        monthly_trend.append({
            'month': m_start.strftime('%Y-%m'),
            'label': m_start.strftime('%b %Y'),
            'inspections': st['inspections'],
            'compliant': st['compliant'],
            'non_compliant': st['non_compliant'],
            'rate': st['rate'],
            'partial': st['partial'],
            # figures for the month immediately before (for the change column)
            'prev_inspections': prev_st['inspections'],
            'prev_rate': prev_st['rate'],
            'prev_label': prev_label,
        })

    # ── Admin monthly series (last 6 months): invoices raised + documents sent,
    #    for the FINANCE report's rising/dropping trend. Both counted per JOB
    #    (distinct InspectionGroup), corporate stores excluded, by action date. ──
    def _admin_month(m_start):
        if m_start.month == 12:
            nxt = m_start.replace(year=m_start.year + 1, month=1)
        else:
            nxt = m_start.replace(month=m_start.month + 1)
        m_end = min(nxt - datetime.timedelta(days=1), week_end)
        inv = (FoodSafetyAgencyInspection.objects
               .filter(invoice_uploaded_date__date__gte=m_start, invoice_uploaded_date__date__lte=m_end)
               .exclude(inspection_group__group_type='Corporate Store')
               .values('inspection_group_id').distinct().count())
        sent = (FoodSafetyAgencyInspection.objects
                .filter(sent_date__date__gte=m_start, sent_date__date__lte=m_end)
                .exclude(inspection_group__group_type='Corporate Store')
                .values('inspection_group_id').distinct().count())
        return {'invoices': inv, 'sent': sent,
                'partial': m_end < (nxt - datetime.timedelta(days=1))}

    admin_monthly = []
    for m_start in reversed(_month_firsts):
        cur_m = _admin_month(m_start)
        # month before this one (used for the change, so the first row isn't blank)
        prev_first = (m_start - datetime.timedelta(days=1)).replace(day=1)
        prev_m = _admin_month(prev_first)
        admin_monthly.append({
            'month': m_start.strftime('%Y-%m'),
            'label': m_start.strftime('%b %Y'),
            'invoices': cur_m['invoices'],
            'sent': cur_m['sent'],
            'partial': cur_m['partial'],
            'prev_invoices': prev_m['invoices'],
            'prev_sent': prev_m['sent'],
            'prev_label': prev_first.strftime('%b'),
        })

    # ── Admin PEOPLE (finance report): per person this week — how many invoices
    #    they uploaded, how many documents they sent, and how fast (average days
    #    from the inspection being APPROVED to the invoice being uploaded). All
    #    counted per job, corporate stores excluded. ──
    _inv_qs = (FoodSafetyAgencyInspection.objects
               .filter(invoice_uploaded_date__date__gte=week_start, invoice_uploaded_date__date__lte=week_end)
               .exclude(inspection_group__group_type='Corporate Store'))
    # invoices uploaded, per user, counted by distinct job
    _people = {}
    for r in (_inv_qs.filter(invoice_uploaded_by__isnull=False)
              .values('invoice_uploaded_by__first_name', 'invoice_uploaded_by__last_name')
              .annotate(jobs=Count('inspection_group_id', distinct=True))):
        nm = f"{r['invoice_uploaded_by__first_name']} {r['invoice_uploaded_by__last_name']}".strip() or 'Unknown'
        _people.setdefault(nm, {'invoices': 0, 'sent': 0, '_days': []})['invoices'] = r['jobs']
    # Speed = inspection date -> invoice-upload days, but ONLY for inspections
    # that happened IN THIS WEEK and have since been invoiced. This keeps the
    # average about THIS week's work — otherwise old inspections invoiced this
    # week (from months ago) inflate it. Corporate excluded.
    for fn, ln, doi, up in (FoodSafetyAgencyInspection.objects
                            .filter(date_of_inspection__gte=week_start, date_of_inspection__lte=week_end,
                                    invoice_uploaded_date__isnull=False, invoice_uploaded_by__isnull=False)
                            .exclude(inspection_group__group_type='Corporate Store')
                            .values_list('invoice_uploaded_by__first_name', 'invoice_uploaded_by__last_name',
                                         'date_of_inspection', 'invoice_uploaded_date')):
        if doi and up:
            d = (up.date() - doi).days   # date_of_inspection is a date
            if d >= 0:
                nm = f"{fn} {ln}".strip() or 'Unknown'
                _people.setdefault(nm, {'invoices': 0, 'sent': 0, '_days': []})['_days'].append(d)
    # documents sent, per person (sent_by_name), counted by distinct job
    _sent_pairs = (FoodSafetyAgencyInspection.objects
                   .filter(sent_date__date__gte=week_start, sent_date__date__lte=week_end)
                   .exclude(inspection_group__group_type='Corporate Store')
                   .values_list('inspection_group_id', 'sent_by_name'))
    _seen_sent = {}
    for gid, snm in _sent_pairs:
        if gid is not None and gid not in _seen_sent:
            _seen_sent[gid] = (snm or '').strip() or 'Unknown'
    from collections import Counter as _Counter
    for nm, cnt in _Counter(_seen_sent.values()).items():
        _people.setdefault(nm, {'invoices': 0, 'sent': 0, '_days': []})['sent'] = cnt
    admin_people = sorted(
        [{'name': nm,
          'invoices': v['invoices'],
          'sent': v['sent'],
          'avg_days': round(sum(v['_days']) / len(v['_days']), 1) if v['_days'] else None,
          'days_count': len(v['_days'])}
         for nm, v in _people.items()],
        key=lambda r: (-r['invoices'], -r['sent'], r['name'].lower()),
    )

    # ── Commodities inspected: last week vs the week before, per commodity.
    #    Corporate-store jobs are billed month-end as one entity, so they are
    #    excluded here to match the rest of the finance figures. ──
    def _by_commodity(a, b):
        out = {}
        for r in (_week_qs(a, b, excl)
                  .exclude(inspection_group__group_type='Corporate Store')
                  .exclude(Q(commodity__isnull=True) | Q(commodity=''))
                  .values('commodity').annotate(n=Count('id'))):
            out[r['commodity']] = r['n']
        return out
    _cw_cur = _by_commodity(week_start, week_end)
    _cw_prev = _by_commodity(prev_start, prev_end)
    commodity_week = sorted(
        [{'commodity': c, 'count': _cw_cur.get(c, 0), 'prev': _cw_prev.get(c, 0)}
         for c in set(_cw_cur) | set(_cw_prev)],
        key=lambda r: -r['count'],
    )

    # ── BILLING BACKLOG (finance action list): RAW/PMP jobs sent to the client
    #    but with NO invoice uploaded yet — completed billable work not yet
    #    invoiced. ONLY Raw meat & PMP are billed (poultry/eggs are not), so the
    #    backlog is restricted to jobs that have a RAW or PMP inspection. Counted
    #    per job, corporate excluded, aged from the inspection date. ──
    from django.db.models import Exists as _Ex, OuterRef as _OR, Min as _Min
    _bl_qs = (InspectionGroup.objects.exclude(group_type='Corporate Store')
              .filter(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), commodity__in=['RAW', 'PMP'])))
              .filter(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), sent_date__isnull=False)))
              .exclude(_Ex(FoodSafetyAgencyInspection.objects.filter(
                  inspection_group_id=_OR('pk'), invoice_uploaded_date__isnull=False)))
              .annotate(insp=_Min('inspections__date_of_inspection')))
    _bl_rows = [{'client': (g.client_name or 'Unknown'),
                 'age': (today - g.insp).days if g.insp else None}
                for g in _bl_qs]
    _buckets = {'d0_7': 0, 'd8_30': 0, 'd31_60': 0, 'd60_plus': 0}
    _by_client = {}
    for r in _bl_rows:
        a = r['age']
        if a is not None:
            if a <= 7:
                _buckets['d0_7'] += 1
            elif a <= 30:
                _buckets['d8_30'] += 1
            elif a <= 60:
                _buckets['d31_60'] += 1
            else:
                _buckets['d60_plus'] += 1
        c = _by_client.setdefault(r['client'], {'client': r['client'], 'jobs': 0, 'oldest': 0})
        c['jobs'] += 1
        if a is not None and a > c['oldest']:
            c['oldest'] = a
    billing_backlog = {
        'total': len(_bl_rows),
        'buckets': _buckets,
        # worst clients to bill — most uninvoiced jobs first
        'top_clients': sorted(_by_client.values(), key=lambda c: (-c['jobs'], -c['oldest']))[:12],
        'oldest_days': max((r['age'] for r in _bl_rows if r['age'] is not None), default=0),
    }

    # ── 6. Travel activity (rank basis: kilometres travelled) ──
    grp_excl = Q(inspector_name__isnull=True) | Q(inspector_name='') | Q(inspector_name__in=excl)
    travel_rows = InspectionGroup.objects.filter(
        date_of_inspection__gte=week_start, date_of_inspection__lte=week_end,
    ).exclude(grp_excl).values('inspector_name').annotate(
        km=Sum('km_traveled'), hours=Sum('hours'),
    )
    # Facilities first captured by each inspector this week (Clients Approval feature)
    new_fac_rows = Client.objects.filter(
        created_at__date__gte=week_start, created_at__date__lte=week_end,
        created_by__isnull=False,
    ).values('created_by__first_name', 'created_by__last_name').annotate(n=Count('id'))
    new_facilities = {}
    for r in new_fac_rows:
        full = f"{r['created_by__first_name']} {r['created_by__last_name']}".strip()
        new_facilities[full.lower()] = r['n']

    travel = []
    for r in travel_rows:
        name = r['inspector_name']
        km = float(r['km'] or 0)
        hours = float(r['hours'] or 0)
        insp = cur.get(name, {}).get('inspections', 0)
        if km == 0 and hours == 0 and insp == 0:
            continue
        travel.append({
            'inspector_name': name,
            'km': round(km, 1),
            'hours': round(hours, 1),
            'inspections': insp,
            'avg_km_per_inspection': round(km / insp, 1) if insp else 0,
            'new_facilities': new_facilities.get(name.lower(), 0),
        })
    travel.sort(key=lambda x: (-x['km'], x['inspector_name'].lower()))
    for i, row in enumerate(travel):
        row['rank'] = i + 1

    # Optional deep-dive for ONE inspector (used by the personal report):
    # their actual inspection records for the period, plus per-day counts.
    inspector_detail = None
    insp_name = (request.GET.get('inspector') or '').strip()
    if insp_name:
        recs = list(
            _week_qs(week_start, week_end, excl)
            .filter(inspector_name__iexact=insp_name)
            .values(
                'client_name', 'date_of_inspection', 'commodity',
                'is_product_compliant', 'approved_status',
                'is_sample_taken', 'coa_uploaded_date',
            )
            .order_by('date_of_inspection', 'client_name')
        )
        daily_counts = {}
        for r in recs:
            daily_counts[r['date_of_inspection']] = daily_counts.get(r['date_of_inspection'], 0) + 1
        day = week_start
        daily = []
        while day <= week_end:
            daily.append({'date': day.isoformat(), 'count': daily_counts.get(day, 0)})
            day += datetime.timedelta(days=1)
        inspector_detail = {
            'name': insp_name,
            'daily': daily,
            'inspections': [
                {
                    'date': r['date_of_inspection'].isoformat() if r['date_of_inspection'] else None,
                    'client': r['client_name'] or '',
                    'commodity': r['commodity'] or '',
                    'result': ('Pass' if r['is_product_compliant'] else 'Fail')
                              if r['is_product_compliant'] is not None else 'Not recorded',
                    'approved': r['approved_status'] == 'APPROVED',
                    'sample_taken': bool(r['is_sample_taken']),
                    'sample_result_back': bool(r['coa_uploaded_date']),
                }
                for r in recs
            ],
        }

    # Back-office turnaround, this period against the last one, so the report
    # shows whether the delays are shrinking rather than just how big they are.
    _cur_turnaround = _turnaround(week_start, week_end)
    _prev_turnaround = _turnaround(prev_start, prev_end)

    # Administration throughput — sends / invoices / COAs this period vs last,
    # who sent the most, and the capture->invoice-upload time.
    _throughput = _admin_throughput(week_start, week_end, prev_start, prev_end)

    # Turnaround response: every stage (including invoice) measured over the same
    # cohort — the inspections done in the week — so "invoice" is how long the
    # week's own inspections took to be invoiced (current weeks show 0, as
    # invoices are uploaded at month-end).
    _turnaround_response = {
        key: {
            **vals,
            'prev_avg': _prev_turnaround.get(key, {}).get('avg'),
            'target': TURNAROUND_TARGETS[key],
            'label': TURNAROUND_LABELS[key],
        }
        for key, vals in _cur_turnaround.items()
    }

    # Management financials for the last 6 full calendar months (newest first).
    _fin_series = _month_financials_series(week_end, excl, n=6)

    return JsonResponse({
        'success': True,
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'inspector_detail': inspector_detail,
        'is_single_week': period_days == 7 and week_start.weekday() == 0,
        'quarter': f'Q{quarter} {year}',
        'admin_lag_days': ADMIN_LAG_DAYS,
        'sample_overdue_days': SAMPLE_OVERDUE_DAYS,
        'totals': {
            'inspections': sum(r['inspections'] for r in cur.values()),
            'prev_inspections': sum(r['inspections'] for r in prev.values()),
            'active_inspectors': len(cur),
            'samples': total_samples,
            'occurrences': sum(r['occurrences'] for r in cur.values()),
            'approved': sum(r['approved'] for r in cur.values()),
            'pending': sum(r['pending'] for r in cur.values()),
            'overall_compliance': overall_rate,
            'prev_overall_compliance': prev_overall_rate,
            'total_km': round(sum(t['km'] for t in travel), 1),
            'total_hours': round(sum(t['hours'] for t in travel), 1),
        },
        'turnaround': _turnaround_response,
        'throughput': _throughput,
        'outstanding_backlog': _outstanding_backlog(),
        'performance': performance,
        'kpi_commodity': kpi_commodity,
        'inspection_trend': trend_weeks,
        'samples': samples,
        'sample_status': sample_status,
        'outstanding_samples': outstanding_detail,
        'approvals': approvals,
        'occurrences': occurrences,
        'occurrence_detail': occurrence_detail,
        'compliance': compliance,
        'commodity_compliance': commodity_compliance,
        'compliance_trend': compliance_trend,
        'monthly_trend': monthly_trend,
        'admin_monthly': admin_monthly,
        'admin_people': admin_people,
        'commodity_week': commodity_week,
        'billing_backlog': billing_backlog,
        'roster': _inspector_roster(),
        # MANAGEMENT-ONLY: revenue/cost/profit per inspector, per full calendar
        # month for the last 6 months (newest first). `monthly_financials` is the
        # newest month alone (used by the glance KPI + Standing Out highlights).
        'monthly_financials': _fin_series[0] if _fin_series else None,
        'monthly_financials_series': _fin_series,
        # Finance/efficiency report: Speed to Cash headline, timeliness scorecard,
        # Rand invoiced this week, and Rand still uninvoiced. MANAGEMENT-ONLY.
        'finance_efficiency': _finance_efficiency(week_start, week_end, prev_start, prev_end),
        'travel': travel,
    })
