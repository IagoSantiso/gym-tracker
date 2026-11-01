import { NextResponse, type NextRequest } from "next/server";
import { POLAR, mapExercise, polarConfigured, type PolarSession } from "@/lib/server/polar";
import { unseal } from "@/lib/server/crypto";

export const dynamic = "force-dynamic";

/** Devuelve los ejercicios disponibles (últimos 30 días) normalizados; el cliente los guarda en local. */
export async function POST(req: NextRequest) {
  if (!polarConfigured()) return NextResponse.json({ error: "Polar no está configurado." }, { status: 503 });
  const raw = req.cookies.get(POLAR.cookie)?.value;
  const s = raw ? unseal<PolarSession>(raw) : null;
  if (!s) return NextResponse.json({ error: "No conectado con Polar." }, { status: 401 });
  const res = await fetch(`${POLAR.api}/exercises?zones=true`, {
    headers: { Authorization: `Bearer ${s.accessToken}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res) return NextResponse.json({ error: "Polar no responde." }, { status: 502 });
  if (res.status === 401 || res.status === 403) return NextResponse.json({ error: "Autorización de Polar revocada o caducada. Vuelve a conectar." }, { status: 401 });
  if (res.status === 204) return NextResponse.json({ exercises: [] });
  if (!res.ok) return NextResponse.json({ error: `Polar respondió ${res.status}.` }, { status: 502 });
  const body = await res.json();
  const list: Record<string, unknown>[] = Array.isArray(body) ? body : body.exercises ?? [];
  return NextResponse.json({ exercises: list.map(mapExercise) }, { headers: { "Cache-Control": "no-store" } });
}
