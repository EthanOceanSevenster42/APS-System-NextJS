import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

// Proxy the FSA Inspector bridge's approval to Django (Ethan, 2026-10-04).
// The bridge posts form-encoded data, so forward the raw body and its
// content-type unchanged rather than re-serialising as JSON.
export async function POST(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const csrf = request.headers.get("x-csrftoken") || "";
    const contentType =
      request.headers.get("content-type") || "application/x-www-form-urlencoded";
    const body = await request.text();
    const res = await fetch(`${DJANGO_API_URL}/api/update-group-approved/`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Cookie: cookie,
        ...(csrf ? { "X-CSRFToken": csrf } : {}),
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 });
  }
}
