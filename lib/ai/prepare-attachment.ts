"use client";
import { AttachmentSchema, type ChatAttachment } from "./attachments";

const readData = (file: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(",")[1]);
  reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
  reader.readAsDataURL(file);
});

export async function prepareAttachment(file: File): Promise<ChatAttachment> {
  const name = file.name.slice(0, 180);
  if (file.size > 12_000_000) throw new Error(`${name}: máximo 12 MB antes de comprimir.`);
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo preparar la foto.");
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return AttachmentSchema.parse({ kind: "image", name, mediaType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] });
    } finally { URL.revokeObjectURL(url); }
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(name)) {
    if (file.size > 1_500_000) throw new Error(`${name}: el PDF debe ocupar menos de 1,5 MB.`);
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (header !== "%PDF-") throw new Error("El archivo no es un PDF válido.");
    return AttachmentSchema.parse({ kind: "pdf", name, mediaType: "application/pdf", data: await readData(file) });
  }
  if (/\.(txt|csv|json|md)$/i.test(name)) {
    if (file.size > 50_000) throw new Error(`${name}: máximo 50 KB para documentos de texto.`);
    return AttachmentSchema.parse({ kind: "text", name, mediaType: "text/plain", text: await file.text() });
  }
  throw new Error("Formato no admitido. Usa JPG, PNG, WebP, PDF, TXT, CSV, JSON o Markdown.");
}
