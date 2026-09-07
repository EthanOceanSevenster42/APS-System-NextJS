#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys
import socket


def _force_utf8_console():
    """Stop debug prints from turning a working request into a 500 on Windows.

    A Windows console defaults to cp1252, and this codebase prints emoji in its
    debug output (2000+ of them across main/). When such a print runs inside a
    request, encoding it raises UnicodeEncodeError, Django converts that into a
    500, and the caller gets an HTML error page instead of JSON - which is how
    a perfectly good file upload ends up as
    "Unexpected token '<', "<!DOCTYPE "... is not valid JSON" in the browser.

    Reconfiguring to UTF-8 with errors="replace" makes those prints
    unconditionally safe. No-op on Linux/macOS, which are already UTF-8.
    """
    for stream in (sys.stdout, sys.stderr):
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except (ValueError, OSError):
                pass   # detached or already-wrapped stream: nothing to do


def main():
    """Run administrative tasks."""
    _force_utf8_console()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')
    socket.setdefaulttimeout(300)  # 5 minutes timeout
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
