"use client";
/** Extracción de texto de PDF en el dispositivo (pdf.js). El archivo no sale del navegador. */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export async function pdfText(bytes: ArrayBuffer, maxPages = 60): Promise<string> {
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("PDF demasiado grande (máximo 10 MB).");
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // pdf.js puede transferir el buffer al worker. Conservar el original para su hash/cifrado.
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), disableFontFace: true });
  try {
    const doc = await task.promise;
    if (doc.numPages > maxPages) throw new Error(`El PDF tiene más de ${maxPages} páginas. Exporta un periodo más corto.`);
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
      page.cleanup();
    }
    return pages.join("\f");
  } finally {
    await task.destroy();
  }
}
