import { NextResponse, type NextRequest } from "next/server";
import { POLAR, polarConfigured, type PolarSession } from "@/lib/server/polar";
import { unseal } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

/** Revoca el registro en Polar (best effort) y borra la cookie. */
export async function POST(req: NextRequest) {
  const raw = req.cookies.get(POLAR.cookie)?.value;
  const s = polarConfigured() && raw ? unseal<PolarSession>(raw) : null;
  if (s) {
    await fetch(`${POLAR.api}/users/${encodeURIComponent(s.userId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${s.accessToken}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete({ name: POLAR.cookie, path: "/api/integrations/polar" });
  return res;
}
