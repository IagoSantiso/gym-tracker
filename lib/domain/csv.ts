/** Parser CSV (RFC 4180 + variantes ; y tab), sin dependencias. */

export function detectDelimiter(sample: string): string {
  const lines = sample.split(/\r?\n/).slice(0, 10).filter(Boolean);
  const cands = [",", ";", "\t"];
  let best = ",";
  let bestScore = -1;
  for (const d of cands) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const max = Math.max(...counts);
    const consistent = counts.filter((c) => c === max).length;
    const score = max > 1 ? consistent * 10 + max : 0;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

function splitLine(line: string, d: string): string[] {
  return parseCsv(line, d)[0] ?? [];
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
