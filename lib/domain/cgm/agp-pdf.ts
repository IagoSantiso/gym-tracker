/**
 * Extracción EXPERIMENTAL de métricas agregadas de un informe AGP en PDF (texto ya extraído).
 * Solo métricas resumidas; nunca se presentan como lecturas individuales.
 * Los patrones cubren textos habituales en inglés y español; si no coinciden, se informa.
 */
export interface AgpPdfSummary {
  pctVeryHigh?: number;
  pctHigh?: number;
  pctInRange?: number;
  pctLow?: number;
  pctVeryLow?: number;
  meanMgdl?: number;
  gmi?: number;
  cv?: number;
  activePct?: number;
  periodText?: string;
  found: string[];
}

const num = (s: string) => Number(s.replace(",", "."));

export function parseAgpText(text: string): AgpPdfSummary {
  const t = text.replace(/\s+/g, " ");
  const out: AgpPdfSummary = { found: [] };
  const grab = (key: keyof AgpPdfSummary, res: RegExp[]) => {
    for (const re of res) {
      const m = re.exec(t);
      if (m) {
        (out as unknown as Record<string, number>)[key] = num(m[1]);
        out.found.push(key);
        return;
      }
    }
  };
  grab("pctVeryHigh", [/very high[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /muy alt[oa][^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  grab("pctHigh", [/(?<!very )high[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /(?<!muy )alt[oa] [^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  grab("pctInRange", [/target range[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /\bin range\b(?!s)[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /(?:rango objetivo|en rango)[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  grab("pctVeryLow", [/very low[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /muy baj[oa][^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  grab("pctLow", [/(?<!very )low[^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i, /(?<!muy )baj[oa] [^%]{0,40}?(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  grab("meanMgdl", [/(?:average|mean) glucose[^0-9]{0,20}(\d{2,3})\s?mg/i, /glucosa media[^0-9]{0,20}(\d{2,3})\s?mg/i]);
  grab("gmi", [/(?:GMI|glucose management indicator)[^0-9]{0,40}(\d{1,2}[.,]\d)\s?%/i, /indicador de gesti[oó]n de (?:la )?glucosa[^0-9]{0,40}(\d{1,2}[.,]\d)\s?%/i]);
  grab("cv", [/(?:glucose variability|coefficient of variation)[^0-9]{0,40}(\d{1,2}(?:[.,]\d)?)\s?%/i, /(?:variabilidad de (?:la )?glucosa|coeficiente de variaci[oó]n)[^0-9]{0,40}(\d{1,2}(?:[.,]\d)?)\s?%/i]);
  grab("activePct", [/(?:time cgm is active|sensor (?:is )?active)[^0-9]{0,30}(\d{1,3}(?:[.,]\d)?)\s?%/i, /(?:tiempo (?:con el|que el) (?:sensor|MCG) (?:est[aá] )?activo)[^0-9]{0,30}(\d{1,3}(?:[.,]\d)?)\s?%/i]);
  const p = /(\d{1,2}\s+\w+\s+\d{4})\s*[-–]\s*(\d{1,2}\s+\w+\s+\d{4})/.exec(t) ?? /(\w+ \d{1,2},? \d{4})\s*[-–]\s*(\w+ \d{1,2},? \d{4})/.exec(t);
  if (p) {
    out.periodText = `${p[1]} – ${p[2]}`;
    out.found.push("periodText");
  }
  return out;
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}
