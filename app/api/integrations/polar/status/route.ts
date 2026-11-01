import { NextResponse, type NextRequest } from "next/server";
import { POLAR, polarConfigured, type PolarSession } from "@/lib/server/polar";
import { unseal } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const configured = polarConfigured();
  const raw = req.cookies.get(POLAR.cookie)?.value;
  const s = configured && raw ? unseal<PolarSession>(raw) : null;
  return NextResponse.json({ configured, connected: !!s, connectedAt: s?.connectedAt ?? null });
}
