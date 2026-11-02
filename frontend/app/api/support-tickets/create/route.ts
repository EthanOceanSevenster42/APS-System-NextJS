import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

export async function POST(request: NextRequest) {
  const cookie = request.headers.get("cookie") || "";
  const res = await fetch(`${DJANGO_API_URL}/api/support-tickets/create/`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: await request.text(),
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ success: false, error: text.slice(0, 200) }, { status: res.status });
  }
}
