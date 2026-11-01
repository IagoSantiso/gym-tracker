import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** Clave de 32 bytes desde TOKEN_ENCRYPTION_KEY (base64 o hex). */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY debe ser de 32 bytes (base64 o hex).");
  return k;
}

export function seal(obj: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function unseal<T>(token: string): T | null {
  try {
    const [iv, tag, enc] = token.split(".").map((s) => Buffer.from(s, "base64url"));
    const d = createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return JSON.parse(Buffer.concat([d.update(enc), d.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}
