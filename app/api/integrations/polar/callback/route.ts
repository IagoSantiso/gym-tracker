import { NextResponse, type NextRequest } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { POLAR, polarConfigured, type PolarSession } from "@/lib/server/polar";
import { seal } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

const back = (req: NextRequest, status: string) => {
  const r = NextResponse.redirect(new URL(`/ajustes?tab=integraciones&polar=${status}`, req.nextUrl.origin));
  r.cookies.delete({ name: POLAR.stateCookie, path: "/api/integrations/polar" });
  return r;
};

export async function GET(req: NextRequest) {
  if (!polarConfigured()) return back(req, "not_configured");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const expected = req.cookies.get(POLAR.stateCookie)?.value ?? "";
  if (!code || !expected || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return back(req, "invalid_state");
  const redirect = process.env.POLAR_REDIRECT_URI ?? new URL("/api/integrations/polar/callback", req.nextUrl.origin).toString();
  const basic = Buffer.from(`${process.env.POLAR_CLIENT_ID}:${process.env.POLAR_CLIENT_SECRET}`).toString("base64");
  const tok = await fetch(POLAR.tokenUrl, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirect }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!tok?.ok) return back(req, "token_error");
  const t = (await tok.json()) as { access_token: string; x_user_id: number | string };
  const memberId = randomUUID();
  const reg = await fetch(`${POLAR.api}/users`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ "member-id": memberId }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!reg || (!reg.ok && reg.status !== 409)) return back(req, reg?.status === 403 ? "consents_missing" : "register_error");
  const session: PolarSession = { accessToken: t.access_token, userId: String(t.x_user_id), memberId, connectedAt: new Date().toISOString() };
  const res = back(req, "ok");
  res.cookies.set(POLAR.cookie, seal(session), { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365, path: "/api/integrations/polar" });
  return res;
}
