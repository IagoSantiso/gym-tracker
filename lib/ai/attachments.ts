/** Límites compartidos: el cuerpo JSON debe caber en una petición serverless. */
import { z } from "zod";

export const MAX_ATTACHMENT_CHARS = 2_800_000;
export const MAX_CHAT_BODY_BYTES = 3_800_000;
export const AttachmentSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("image"), name: z.string().min(1).max(180), mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().min(4).max(MAX_ATTACHMENT_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/) }),
  z.strictObject({ kind: z.literal("pdf"), name: z.string().min(1).max(180), mediaType: z.literal("application/pdf"), data: z.string().min(4).max(MAX_ATTACHMENT_CHARS).regex(/^[A-Za-z0-9+/]+={0,2}$/) }),
  z.strictObject({ kind: z.literal("text"), name: z.string().min(1).max(180), mediaType: z.literal("text/plain"), text: z.string().min(1).max(50_000) }),
]);
export type ChatAttachment = z.infer<typeof AttachmentSchema>;
export const attachmentSize = (a: ChatAttachment) => a.kind === "text" ? a.text.length : a.data.length;
export const attachmentText = (a: ChatAttachment) => a.kind === "text" ? `Archivo adjunto: ${a.name}\n<contenido_no_confiable>\n${a.text}\n</contenido_no_confiable>` : "";
