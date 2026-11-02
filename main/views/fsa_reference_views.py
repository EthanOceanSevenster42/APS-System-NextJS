"""Reference data and fees for the inspector tablets, edited from this site.

Demo-only (Ethan, 2026-09-29). The inspector app's server holds the egg
sizes, product lists, checklist wording and the RFI tariff that every tablet
downloads; this page reads and saves them there, signed in with a service
account of its own, so there is one source and the tablets pick a change up
on their next sync.
"""

import json
import logging
import os
import re
import time
from urllib.parse import urlparse

import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

log = logging.getLogger(__name__)

_BASE = os.environ.get("FSA_INSPECTOR_URL", "http://127.0.0.1:8007").rstrip("/")
_USERNAME = os.environ.get("FSA_INSPECTOR_USERNAME", "")
_PASSWORD = os.environ.get("FSA_INSPECTOR_PASSWORD", "")
_ALLOWED_ROLES = {"admin", "super_admin", "developer"}
_TOKEN = {"access": "", "at": 0.0}
_TOKEN_AGE = 11 * 3600  # the inspector server's tokens last 12 hours
_KEY = re.compile(r"^[a-z]+\.[a-z_]+$")


def _sign_in() -> str:
    response = requests.post(f"{_BASE}/api/auth/login/",
                             json={"username": _USERNAME, "password": _PASSWORD},
                             timeout=15)
    access = response.json().get("access", "") if response.ok else ""
    if not access:
        raise RuntimeError("The inspector server refused the reference account.")
    _TOKEN.update(access=access, at=time.time())
    return access


def _token(fresh: bool = False) -> str:
    if fresh or not _TOKEN["access"] or time.time() - _TOKEN["at"] > _TOKEN_AGE:
        return _sign_in()
    return _TOKEN["access"]


def _forward(method: str, path: str, *, params=None, body=None):
    """Calls the inspector server, signing in again once if the token lapsed."""
    for attempt in (0, 1):
        response = requests.request(
            method, f"{_BASE}{path}", params=params,
            json=body if body is not None else None,
            headers={"Authorization": f"Bearer {_token(fresh=attempt == 1)}",
                     "Accept": "application/json"},
            timeout=30,
        )
        if response.status_code != 401:
            break
    try:
        data = response.json()
    except ValueError:
        data = {"detail": f"The inspector server answered {response.status_code}."}
    return JsonResponse(data, status=response.status_code, safe=False)


def _same_site(request) -> bool:
    """A change must come from this site's own pages."""
    source = request.headers.get("Origin") or request.headers.get("Referer") or ""
    return urlparse(source).netloc == request.get_host()


@csrf_exempt
def api_fsa_reference(request, subpath=""):
    """/api/fsa-reference/                  the tables, by commodity
    /api/fsa-reference/tariff/            the RFI tariff (GET, PUT)
    /api/fsa-reference/<table>/           a table's rows (GET ?q=&page=, POST)
    /api/fsa-reference/<table>/<id>/      one row (PATCH)"""
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Sign in first."}, status=401)
    if (getattr(user, "role", "") or "") not in _ALLOWED_ROLES:
        return JsonResponse({"detail": "Only admins can change reference data."},
                            status=403)
    if request.method not in ("GET", "HEAD") and not _same_site(request):
        return JsonResponse({"detail": "Refused: not from this site."}, status=403)
    if not (_USERNAME and _PASSWORD):
        return JsonResponse({"detail": "The reference account is not set up."},
                            status=503)

    parts = [p for p in subpath.strip("/").split("/") if p]
    try:
        body = json.loads(request.body or b"{}") if request.method in ("POST", "PUT", "PATCH") else None
    except ValueError:
        return JsonResponse({"detail": "Not valid JSON."}, status=400)

    try:
        if not parts and request.method == "GET":
            return _forward("GET", "/api/reference-admin/")
        if parts == ["tariff"] and request.method in ("GET", "PUT"):
            if request.method == "PUT":
                log.info("RFI tariff changed from aps-demo by %s: %s",
                         user.username, body)
            return _forward(request.method, "/api/visits/tariff/", body=body)
        if len(parts) == 1 and _KEY.match(parts[0]) and request.method in ("GET", "POST"):
            if request.method == "POST":
                log.info("Reference row added to %s from aps-demo by %s",
                         parts[0], user.username)
            return _forward(request.method, f"/api/reference-admin/{parts[0]}/",
                            params=request.GET.dict() or None, body=body)
        if (len(parts) == 2 and _KEY.match(parts[0]) and parts[1].isdigit()
                and request.method == "PATCH"):
            log.info("Reference row %s/%s changed from aps-demo by %s: %s",
                     parts[0], parts[1], user.username, body)
            return _forward("PATCH", f"/api/reference-admin/{parts[0]}/{parts[1]}/",
                            body=body)
    except (requests.RequestException, RuntimeError) as error:
        log.warning("Reference data request failed: %s", error)
        return JsonResponse({"detail": "The inspector server could not be reached."},
                            status=502)
    return JsonResponse({"detail": "Not found."}, status=404)


@csrf_exempt
def api_fsa_app_versions(request):
    """/api/fsa-app-versions/   which build each inspector's tablet runs, as
    the tablets report it to the inspector server, with the build currently
    published for download to compare against (Ethan, 2026-09-29)."""
    user = request.user
    if not user.is_authenticated:
        return JsonResponse({"detail": "Sign in first."}, status=401)
    if (getattr(user, "role", "") or "") not in _ALLOWED_ROLES:
        return JsonResponse({"detail": "Only admins can see the app versions."},
                            status=403)
    if request.method != "GET":
        return JsonResponse({"detail": "Read only."}, status=405)
    if not (_USERNAME and _PASSWORD):
        return JsonResponse({"detail": "The reference account is not set up."},
                            status=503)
    try:
        response = _forward("GET", "/api/auth/app-versions/")
    except (requests.RequestException, RuntimeError) as error:
        log.warning("App versions request failed: %s", error)
        return JsonResponse({"detail": "The inspector server could not be reached."},
                            status=502)
    if response.status_code != 200:
        return response
    from .apk_download import _latest

    data = json.loads(response.content)
    published = _latest()
    data["latest"] = {"version": published["version"], "updated": published["updated"]}
    return JsonResponse(data)
