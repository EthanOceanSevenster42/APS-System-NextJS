import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

// The tickets board lives in Django; this hands the browser's session
// through so the page can be rendered inside the platform shell instead of
// sending people out to the legacy template.
export async function GET(request: NextRequest) {
  try {
    const cookie = request.headers.get("cookie") || "";
    const qs = request.nextUrl.search || "";
    const res = await fetch(`${DJANGO_API_URL}/api/support-tickets/${qs}`, {
      headers: { Cookie: cookie },
      cache: "no-store",
    });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { success: false, tickets: [], stats: {}, all_users: [], error: String(e) },
      { status: 500 },
    );
  }
}
