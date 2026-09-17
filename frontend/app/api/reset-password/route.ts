import { NextRequest, NextResponse } from "next/server";
import { DJANGO_API_URL } from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const uidb64 = request.headers.get("X-UIDB64");
    const token = request.headers.get("X-TOKEN");

    if (!uidb64 || !token) {
      return NextResponse.json(
        { success: false, error: "Missing uidb64 or token" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const body = new URLSearchParams();

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        body.append(key, value);
      }
    }

    const res = await fetch(
      `${DJANGO_API_URL}/reset-password/${encodeURIComponent(uidb64)}/${encodeURIComponent(token)}/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Ask Django for JSON so a rejected password is not mistaken for a
          // success — the HTML flow answers 200/302 whatever the outcome.
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body,
        redirect: "manual",
      }
    );

    const text = await res.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: res.status });
    } catch {
      // Non-JSON means the request never reached the JSON branch (proxy error,
      // legacy template, redirect). Never report that as a successful reset.
      return NextResponse.json(
        {
          success: false,
          error: "Unexpected response from the server. Please try again.",
        },
        { status: res.ok ? 502 : res.status }
      );
    }
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 502 });
  }
}
