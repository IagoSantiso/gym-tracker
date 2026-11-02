/** PDF sintético, sin datos personales, con el AGP en la página 12 (regresión del límite de 10). */
import { readFileSync } from "node:fs";
export function syntheticAgpPdf() {
  const text = readFileSync(new URL("./agp-synthetic.txt", import.meta.url), "utf8");
  const pages = [...Array.from({ length: 11 }, (_, i) => `Pagina de grafico ${i + 1}\nPerfil diario sin lecturas individuales`), text];
  const objects = ["", "<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const kids = [];
  for (const page of pages) {
    const pageId = objects.length;
    const streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    const escape = (s) => s.replace(/([\\()])/g, "\\$1");
    const stream = `BT /F1 11 Tf 35 750 Td 18 TL\n${page.split("\n").map((line) => `(${escape(line)}) Tj T*`).join("\n")}\nET`;
    objects.push(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
