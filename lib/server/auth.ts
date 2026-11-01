import "server-only";
/**
 * Autorización de las rutas /api/ai/*: JWT de Supabase + lista de emails permitidos.
 * Sin Supabase, la IA solo funciona con AI_ALLOW_ANONYMOUS=true (pensado para uso local).
 */
import { createClient } from "@supabase/supabase-js";

export interface Caller {
  key: string;
  email: string | null;
}

export async function authorize(req: Request): Promise<Caller | { error: string; status: number }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const allowed = (process.env.ALLOWED_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (url && anon && token) {
    const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.auth.getUser(token);
    if (error || !data.user) return { error: "Sesión no válida.", status: 401 };
    const email = data.user.email?.toLowerCase() ?? null;
    if (allowed.length && (!email || !allowed.includes(email))) return { error: "Usuario no autorizado para usar la IA.", status: 403 };
    return { key: `u:${data.user.id}`, email };
  }
  if (process.env.AI_ALLOW_ANONYMOUS === "true") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    return { key: `ip:${ip}`, email: null };
  }
  return { error: url ? "Inicia sesión (Ajustes → Sincronización) para usar el asistente." : "El asistente requiere configurar Supabase (o AI_ALLOW_ANONYMOUS=true en local).", status: 401 };
}
