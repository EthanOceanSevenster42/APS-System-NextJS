import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

// Proxy the Reference Data page to Django's /api/fsa-reference/ (Ethan,
// 2026-10-04). Prod serves /api through Next.js, so this forwards the
// method, path, query, cookies and body. Origin/Referer are set to the
// Django host so its same-site write check passes behind the proxy.
const PREFIX = "/api/fsa-reference/";

async function forward(request: NextRequest) {
  const p = request.nextUrl.pathname;
  const sub = p.startsWith(PREFIX) ? p.slice(PREFIX.length) : "";
  const qs = request.nextUrl.search || "";
  const method = request.method;
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  try {
    const res = await fetch(`${DJANGO_API_URL}${PREFIX}${sub}${qs}`, {
      method,
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        Cookie: request.headers.get("cookie") || "",
        Origin: DJANGO_API_URL,
        Referer: DJANGO_API_URL + "/",
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ detail: String(e) }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
