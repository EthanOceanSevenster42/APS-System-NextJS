import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const qs = searchParams.toString();
    const cookie = request.headers.get("cookie") || "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 115000);
    const res = await fetch(`${DJANGO_API_URL}/api/analytics/${qs ? `?${qs}` : ""}`, {
      headers: { Cookie: cookie },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    // Pass the upstream body straight through. This route does not read or
    // change the payload, and `await res.json()` + `NextResponse.json()` was
    // fully parsing ~3 MB of JSON and re-serialising it on every request just
    // to hand back the same bytes. Returning the text keeps the response
    // identical while skipping that round trip.
    const body = await res.text();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Keep the upstream cache-status visible for debugging.
    const cacheHdr = res.headers.get("x-analytics-cache");
    if (cacheHdr) headers["X-Analytics-Cache"] = cacheHdr;
    return new NextResponse(body, { status: res.status, headers });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 });
  }
}
