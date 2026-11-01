"use client";
/** Cliente Supabase (opcional) y adaptador remoto para el motor de sync. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RemoteAdapter, Row } from "./engine";

let client: SupabaseClient | null | undefined;

export function supabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  client = supabaseConfigured()
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  return client;
}

export async function accessToken(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export function supabaseAdapter(sb: SupabaseClient): RemoteAdapter {
  return {
    async userId() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },
    async upsert(table, rows) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: "user_id,id" });
      if (error) throw new Error(`${table}: ${error.message}`);
    },
    async pull(table, cursor, limit) {
      let q = sb.from(table).select("*").order("server_updated_at", { ascending: true }).order("id", { ascending: true }).limit(limit);
      if (cursor) q = q.or(`server_updated_at.gt.${cursor.ts},and(server_updated_at.eq.${cursor.ts},id.gt.${cursor.id})`);
      const { data, error } = await q;
      if (error) throw new Error(`${table}: ${error.message}`);
      return (data ?? []) as Row[];
    },
    async deleteAll(table) {
      const uid = await this.userId();
      if (!uid) return;
      const { error } = await sb.from(table).delete().eq("user_id", uid);
      if (error) throw new Error(`${table}: ${error.message}`);
    },
  };
}
