import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

async function forward(request: NextRequest, path: string) {
  const cookie = request.headers.get("cookie") || "";
  const body = await request.text();
  const res = await fetch(`${DJANGO_API_URL}${path}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body,
  });
  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return NextResponse.json({ success: false, error: text.slice(0, 200) }, { status: res.status });
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return forward(request, `/api/support-tickets/${id}/update-status/`);
}
