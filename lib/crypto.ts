/**
 * Cifrado local de archivos originales (AES-GCM 256) con clave NO exportable guardada en IndexedDB.
 * Protege frente a lectura casual del almacenamiento; no frente a código que se ejecute en el mismo origen.
 */
import { getMeta, setMeta } from "@/lib/db/db";

async function key(): Promise<CryptoKey> {
  const existing = await getMeta<CryptoKey | null>("fileKey", null);
  if (existing) return existing;
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await setMeta("fileKey", k);
  return k;
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptBytes(data: ArrayBuffer): Promise<{ iv: string; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), data);
  return { iv: b64(iv), data: out };
}

export async function decryptBytes(iv: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await key(), data);
}
