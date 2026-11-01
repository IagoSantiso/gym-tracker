import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { POLAR, polarConfigured } from "@/lib/server/polar";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!polarConfigured()) return NextResponse.json({ error: "Polar no está configurado en el servidor." }, { status: 503 });
  const state = randomBytes(16).toString("hex");
  const redirect = process.env.POLAR_REDIRECT_URI ?? new URL("/api/integrations/polar/callback", req.nextUrl.origin).toString();
  const url = new URL(POLAR.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.POLAR_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", "accesslink.read_all");
  url.searchParams.set("state", state);
  const res = NextResponse.redirect(url);
  res.cookies.set(POLAR.stateCookie, state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/api/integrations/polar" });
  return res;
}
