"""
Capability-based authorization.

Views ask for a named *capability* (e.g. "manage_fees"), never for specific
role names. The single source of truth for "which roles have which capability"
is the CAPABILITIES map below — change a role's access in one place and every
endpoint that guards on that capability follows automatically.

Usage in a view module:

    from ..permissions import require_capability, user_can

    @require_capability('download_backups')
    def api_download_backup(request):
        ...

    # or, when GET and POST need different capabilities in one view:
    if request.method == 'POST' and not user_can(request.user, 'manage_salaries'):
        return capability_denied()
"""
from functools import wraps

from django.http import JsonResponse

# Role identifiers (must match User.role choices in models.py)
INSPECTOR = 'inspector'
INSPECTOR_MANAGER = 'inspector_manager'
ADMIN = 'admin'
SUPER_ADMIN = 'super_admin'
FINANCIAL = 'financial'
LAB_TECHNICIAN = 'lab_technician'
DEVELOPER = 'developer'

# Convenience groupings — used only to build the map below, never referenced by views.
_OWNERS = frozenset({SUPER_ADMIN, DEVELOPER})                      # full-trust operators
_OFFICE = _OWNERS | {ADMIN}                                        # + back-office admins
_FINANCE = _OFFICE | {FINANCIAL}                                   # + finance clerk

# capability -> set of roles that hold it. THIS is the only place roles are enumerated.
CAPABILITIES = {
    # User & system administration
    'manage_users':            _OWNERS,
    'manage_notifications':    _OWNERS,
    'manage_targets':          _OWNERS,
    'manage_salaries':         _OWNERS,
    'download_backups':        _OWNERS,
    'manage_system':           _OWNERS,      # trigger backups, browse the media file tree

    # Finance
    'manage_fees':             _FINANCE,
    'view_financials':         _FINANCE,     # debtors, salary figures, invoice export
    'send_invoices':           _FINANCE,

    # Back-office operations
    'view_system_logs':        _OFFICE,
    'view_org_analytics':      _OFFICE,
    # Late-capture monitoring: everyone except field inspectors and lab
    # technicians — managers/office/finance follow up on late capturers.
    'view_late_capture_report': _FINANCE | {INSPECTOR_MANAGER},
    'manage_clients':          _OFFICE | {INSPECTOR_MANAGER},
    'manage_inspection_groups': _OFFICE | {INSPECTOR_MANAGER},
    # Field inspectors record and correct their own inspection data
    # (km traveled, hours, travel times, comments) via the edit/save flow.
    'edit_inspections':        _OFFICE | {INSPECTOR_MANAGER, INSPECTOR},
    'manage_support_tickets':  frozenset({SUPER_ADMIN}),  # super_admin only (Ethan, 2026-10-13)

    # Documents & lab
    'delete_documents':        _FINANCE | {LAB_TECHNICIAN},   # everyone except field inspectors
    'manage_sample_discrepancies': _OWNERS | {LAB_TECHNICIAN},
}


def user_can(user, capability):
    """True if `user`'s role holds `capability`."""
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    allowed = CAPABILITIES.get(capability)
    if allowed is None:
        raise KeyError(f"Unknown capability: {capability!r}")
    return getattr(user, 'role', None) in allowed


def capability_denied():
    """Standard JSON 403 for a failed capability check."""
    return JsonResponse({'success': False, 'error': 'Access denied'}, status=403)


def require_capability(capability):
    """
    Decorator: require `capability` for the whole view.

    OPTIONS requests pass straight through so each view's own CORS-preflight
    handling still runs. Authentication itself is already guaranteed by
    ApiLoginRequiredMiddleware; this layer adds the per-role check.
    """
    # Fail fast on a typo'd capability name at import time.
    if capability not in CAPABILITIES:
        raise KeyError(f"Unknown capability: {capability!r}")

    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            if request.method == 'OPTIONS':
                return view_func(request, *args, **kwargs)
            if not user_can(request.user, capability):
                return capability_denied()
            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator
