/**
 * Parse bulk opname text input.
 * Format: one line per stack — "KODE QTY"
 * e.g.:
 *   R533 10
 *   R533 15
 *   2115 10
 *   055 5
 *
 * Result: grouped by kode with stacks array
 *   { R533: [10, 15], 2115: [10], 055: [5] }
 */

export interface ParsedOpnameItem {
  kode: string;
  stacks: number[];
  total: number;
}

export function parseOpnameText(text: string): ParsedOpnameItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const grouped = new Map<string, number[]>();

  for (const line of lines) {
    // Match: KODE <space/tab> QTY — lenient: allow leading/trailing chars, dots, dashes
    const cleaned = line.replace(/[•\-–—·*#]/g, "").trim();
    const match = cleaned.match(/^([A-Za-z0-9]+)\s+(\d+)/);
    if (!match) continue;

    const kode = match[1].toUpperCase();
    const qty = parseInt(match[2], 10);
    if (qty <= 0) continue;

    if (!grouped.has(kode)) {
      grouped.set(kode, []);
    }
    grouped.get(kode)!.push(qty);
  }

  const result: ParsedOpnameItem[] = [];
  for (const [kode, stacks] of grouped) {
    const sorted = [...stacks].sort((a, b) => a - b);
    result.push({ kode, stacks: sorted, total: sorted.reduce((s, v) => s + v, 0) });
  }

  return result;
}
