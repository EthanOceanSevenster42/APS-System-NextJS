from django.utils import timezone
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.contrib import messages
from .models import Settings
from datetime import timedelta
from django.utils.deprecation import MiddlewareMixin
from django.contrib.auth.models import User
from .models import SystemLog
import json
import threading

# Thread-local storage for the current request user (used by audit signals)
_thread_locals = threading.local()


def get_current_user():
    """Return the user making the current request, or None."""
    return getattr(_thread_locals, 'user', None)


def get_current_path():
    """Return the path of the current request, or None.

    Audit signals record it so an archived deletion says which endpoint or page
    the delete came from, not just who did it.
    """
    return getattr(_thread_locals, 'path', None)


class CurrentUserMiddleware:
    """Store the current request user in thread-local so signals can access it."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        _thread_locals.user = getattr(request, 'user', None)
        _thread_locals.path = getattr(request, 'path', None)
        try:
            return self.get_response(request)
        finally:
            _thread_locals.user = None
            _thread_locals.path = None


class ApiAuthJsonMiddleware:
    """
    For /api/ requests, convert a redirect to the login page into a clean JSON
    401 response.

    Django's @login_required (and other auth gates) respond to unauthenticated
    requests with a 302 redirect to LOGIN_URL. That's correct for full-page
    navigation, but the Next.js /api proxy does `res.json()` on the upstream
    response — a 302 makes fetch follow the redirect to the HTML login page,
    JSON parsing throws, and the proxy surfaces it to the browser as a 502 Bad
    Gateway. Returning a JSON 401 instead lets the frontend detect the expired
    session and handle it gracefully.

    Only redirects to our OWN login path are rewritten; external OAuth redirects
    (e.g. Xero, which are absolute https URLs) are left untouched.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        from django.conf import settings
        login = getattr(settings, 'LOGIN_URL', '/login/')
        if login and not str(login).startswith('/'):
            try:
                from django.urls import reverse
                login = reverse(login)
            except Exception:
                login = '/' + str(login)
        self.login_path = login or '/login/'

    def __call__(self, request):
        response = self.get_response(request)
        if (request.path.startswith('/api/')
                and getattr(response, 'status_code', 0) in (301, 302)):
            location = response.headers.get('Location', '') or ''
            # Relative redirect to our own login page only — never absolute
            # external URLs (OAuth providers).
            if location.startswith(self.login_path):
                from django.http import JsonResponse
                return JsonResponse(
                    {'success': False, 'error': 'Authentication required'},
                    status=401,
                )
        return response


class ApiLoginRequiredMiddleware:
    """
    Require an authenticated session for every /api/ endpoint.

    The Next.js frontend forwards the browser's session cookie on its proxy
    requests, so logged-in users pass through unchanged. Anyone without a
    valid session gets a JSON 401 before reaching the view. Only the
    endpoints a user needs BEFORE they have a session are exempt.
    """

    EXEMPT_PATHS = frozenset({
        '/api/login',       # session creation
        '/api/verify-otp',  # first-time password setup via emailed OTP
    })

    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _internal_ok(request):
        """Server-to-server access for the automatic Monday weekly-report
        email (PDF generation) — key-protected, this one endpoint only."""
        if request.path.rstrip('/') != '/api/weekly-report':
            return False
        from django.conf import settings
        key = getattr(settings, 'WEEKLY_INTERNAL_KEY', '')
        return bool(key) and request.headers.get('X-Internal-Key') == key

    def __call__(self, request):
        if (request.path.startswith('/api/')
                and request.method != 'OPTIONS'  # CORS preflights carry no cookies
                and request.path.rstrip('/') not in self.EXEMPT_PATHS
                and not self._internal_ok(request)
                and not (getattr(request, 'user', None) and request.user.is_authenticated)):
            from django.http import JsonResponse
            return JsonResponse(
                {'success': False, 'error': 'Authentication required'},
                status=401,
            )
        return self.get_response(request)


class SecurityHeadersMiddleware:
    """Middleware to add modern security headers to all responses"""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Content Security Policy - Restricts resource loading
        # Configured for Food Safety Agency application with CDN support
        response['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https: http:; "
            "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

        # Permissions Policy - Control browser features
        response['Permissions-Policy'] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=(), "
            "usb=(), "
            "magnetometer=(), "
            "gyroscope=(), "
            "accelerometer=()"
        )

        # X-Content-Type-Options - Prevent MIME sniffing
        response['X-Content-Type-Options'] = 'nosniff'

        # X-Frame-Options - Prevent clickjacking (redundant but belt-and-suspenders)
        if 'X-Frame-Options' not in response:
            response['X-Frame-Options'] = 'DENY'

        # Referrer-Policy - Control referrer information
        response['Referrer-Policy'] = 'same-origin'

        # X-XSS-Protection - Legacy XSS filter (for older browsers)
        response['X-XSS-Protection'] = '1; mode=block'

        return response

class SessionTimeoutMiddleware:
    """Middleware to enforce session timeout based on database settings"""
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Skip middleware for login-related URLs
        if request.path.startswith('/login/'):
            return self.get_response(request)
            
        # Only check session timeout for authenticated users
        if request.user.is_authenticated:
            try:
                # Get settings from database
                settings = Settings.get_settings()
                session_timeout_minutes = settings.session_timeout
                
                # Get last activity from session
                last_activity = request.session.get('last_activity')
                current_time = timezone.now()
                
                if last_activity:
                    # Convert last_activity string back to datetime
                    last_activity = timezone.datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                    
                    # Check if session has expired
                    timeout_threshold = last_activity + timedelta(minutes=session_timeout_minutes)
                    
                    if current_time > timeout_threshold:
                        # Session expired - log out user
                        logout(request)
                        messages.warning(request, "Your session has expired. Please log in again.")
                        return redirect('login')
                
                # Update last activity timestamp only if not in sync operation
                if not getattr(request, '_sync_in_progress', False):
                    request.session['last_activity'] = current_time.isoformat()
                    # Don't explicitly save the session here to avoid conflicts
                    # Django will save it automatically at the end of the request
                
            except Exception as e:
                # If there's an error getting settings, use default 30 minutes
                print(f"Session timeout middleware error: {e}")
                # Don't let session errors break the request
                # But ensure session is valid for the request
                if not request.session.session_key:
                    try:
                        request.session.create()
                    except Exception as session_error:
                        print(f"Failed to create session: {session_error}")
                        pass
        
        response = self.get_response(request)
        
        # Prevent session save if response has the flag set
        if hasattr(response, '_session_save') and not response._session_save:
            # Mark the session as not modified to prevent save
            request.session.modified = False
        
        return response

class ActivityLoggingMiddleware(MiddlewareMixin):
    """Middleware to automatically log user activities"""
    
    def process_request(self, request):
        """Log the request before processing"""
        if hasattr(request, 'user') and request.user.is_authenticated:
            # Get client IP
            x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
            if x_forwarded_for:
                ip = x_forwarded_for.split(',')[0]
            else:
                ip = request.META.get('REMOTE_ADDR')
            
            # Get user agent
            user_agent = request.META.get('HTTP_USER_AGENT', '')
            
            # Determine action based on request
            action = self._determine_action(request)
            
            # Only log if it's a meaningful action
            if action:
                try:
                    SystemLog.log_activity(
                        user=request.user,
                        action=action,
                        page=request.path,
                        ip_address=ip,
                        user_agent=user_agent,
                        description=self._get_description(request, action)
                    )
                except Exception as e:
                    # Don't let logging errors break the application
                    print(f"Error logging activity: {e}")
    
    def _determine_action(self, request):
        """Determine the action type based on the request"""
        path = request.path.lower()
        method = request.method.upper()
        
        # Login/Logout actions
        if path.endswith('/login/') and method == 'POST':
            return 'LOGIN'
        elif path.endswith('/logout/') and method == 'POST':
            return 'LOGOUT'
        
        # Navigation actions
        elif method == 'GET' and not path.startswith('/static/') and not path.startswith('/media/') and not path.startswith('/api/'):
            if 'home' in path:
                return 'NAVIGATE'
            elif 'settings' in path:
                return 'SETTINGS'
            elif 'user-management' in path:
                return 'USER_MANAGEMENT'
            elif 'system-logs' in path:
                return 'VIEW'
            elif 'analytics' in path:
                return 'VIEW'
            elif 'inspections' in path or 'shipment' in path:
                return 'VIEW'
            elif 'clients' in path:
                return 'VIEW'
            elif 'client-allocation' in path:
                return 'VIEW'
        
        # Form submissions
        elif method == 'POST':
            if 'add' in path or 'create' in path:
                return 'CREATE'
            elif 'edit' in path or 'update' in path:
                return 'UPDATE'
            elif 'delete' in path:
                return 'DELETE'
            elif 'refresh' in path:
                return 'SYNC'
            elif 'export' in path:
                return 'EXPORT'
            elif 'import' in path:
                return 'IMPORT'
            elif 'upload' in path:
                return 'FILE_UPLOAD'
            elif 'search' in path or 'filter' in path:
                return 'SEARCH'
        
        return None
    
    # Friendly page names for human-readable descriptions
    PAGE_NAMES = {
        '/home/': 'Home',
        '/inspections/': 'Inspection Records',
        '/system-logs/': 'System Logs',
        '/analytics-dashboard/': 'Analytics Dashboard',
        '/api/analytics-dashboard/': 'Analytics Dashboard',
        '/settings/': 'Settings',
        '/user-management/': 'User Management',
        '/clients/': 'Clients',
        '/client-allocation/': 'Client Allocation Sheet',
        '/client-allocation-sheet/': 'Client Allocation Sheet',
        '/debtors/': 'Debtors',
        '/training/': 'Training',
        '/fsa-operations-board/': 'FSA Operations Board',
        '/submit-ticket/': 'Submit Ticket',
        '/onedrive/': 'OneDrive',
        '/server-view/': 'Server View',
    }

    def _get_page_name(self, path):
        """Get friendly page name from URL path"""
        if path in self.PAGE_NAMES:
            return self.PAGE_NAMES[path]
        # Try partial matches
        for url, name in self.PAGE_NAMES.items():
            if url.rstrip('/') in path:
                return name
        # Fallback: clean up the path
        clean = path.strip('/').replace('-', ' ').replace('_', ' ').title()
        return clean if clean else path

    def _get_description(self, request, action):
        """Generate a human-readable description for the logged action"""
        path = request.path
        username = request.user.get_full_name() or request.user.username
        page_name = self._get_page_name(path)

        if action == 'LOGIN':
            return f"{username} logged in"
        elif action == 'LOGOUT':
            return f"{username} logged out"
        elif action == 'NAVIGATE':
            return f"{username} went to {page_name}"
        elif action == 'VIEW':
            return f"{username} viewed {page_name}"
        elif action == 'SETTINGS':
            return f"{username} opened Settings"
        elif action == 'USER_MANAGEMENT':
            return f"{username} opened User Management"
        elif action == 'CREATE':
            return f"{username} created a new record on {page_name}"
        elif action == 'UPDATE':
            return f"{username} updated a record on {page_name}"
        elif action == 'DELETE':
            return f"{username} deleted a record on {page_name}"
        elif action == 'SYNC':
            return f"{username} synced data on {page_name}"
        elif action == 'EXPORT':
            return f"{username} exported data from {page_name}"
        elif action == 'IMPORT':
            return f"{username} imported data to {page_name}"
        elif action == 'FILE_UPLOAD':
            return f"{username} uploaded a file on {page_name}"
        elif action == 'SEARCH':
            return f"{username} searched on {page_name}"
        else:
            return f"{username} accessed {page_name}"
