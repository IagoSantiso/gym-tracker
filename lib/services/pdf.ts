"use client";
/** Extracción de texto de PDF en el dispositivo (pdf.js). El archivo no sale del navegador. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function pdfText(bytes: ArrayBuffer, maxPages = 10): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true }).promise;
  let text = "";
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + "\n";
  }
  await doc.cleanup();
  return text;
}
