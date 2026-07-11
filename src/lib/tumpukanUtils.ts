// Tumpukan (stack) utility functions
// Standard products: max stack 25
// BLCK & WHT (2 Ons): max stack 50
// 5 Ons products: max stack 32
// 8 Ons products: max stack 15 (pre-order)

const SPECIAL_CODES = ["BLCK", "WHT"];

export function getMaxStack(kode: string, kategori?: string): number {
  if (kategori === "8 Ons") return 15;
  if (kategori === "5 Ons") return 32;
  return SPECIAL_CODES.includes(kode.toUpperCase()) ? 50 : 25;
}

/**
 * Split a quantity into stacks based on product rules
 * e.g. splitIntoStacks(50, "R533") => [25, 25]
 * e.g. splitIntoStacks(50, "BLCK") => [50]
 */
export function splitIntoStacks(qty: number, kode: string, kategori?: string): number[] {
  if (qty <= 0) return [];
  const max = getMaxStack(kode, kategori);
  const stacks: number[] = [];
  let remaining = qty;
  while (remaining > 0) {
    const size = Math.min(remaining, max);
    stacks.push(size);
    remaining -= size;
  }
  // Sort small to large
  return stacks.sort((a, b) => a - b);
}

/**
 * Merge new stacks into existing stacks array, then sort small→large
 */
export function addStacks(existing: number[], newStacks: number[]): number[] {
  const merged = [...existing, ...newStacks];
  return merged.sort((a, b) => a - b);
}

/**
 * Deduct qty from stacks, always taking from leftmost (smallest) first
 * Returns the new stacks array after deduction
 * e.g. deductFromStacks([15, 25, 25], 10) => [5, 25, 25]
 * e.g. deductFromStacks([15, 25, 25], 20) => [20, 25] (15 fully consumed + 5 from next)
 */
export function deductFromStacks(stacks: number[], qty: number): number[] {
  const result = [...stacks];
  let remaining = qty;
  
  for (let i = 0; i < result.length && remaining > 0; i++) {
    if (result[i] <= remaining) {
      remaining -= result[i];
      result[i] = 0;
    } else {
      result[i] -= remaining;
      remaining = 0;
    }
  }
  
  // Remove empty stacks and sort
  return result.filter((s) => s > 0).sort((a, b) => a - b);
}

/**
 * Render stacks as display text: "[15] [25] [25]"
 */
export function formatStacks(stacks: number[]): string {
  if (!stacks || stacks.length === 0) return "-";
  return stacks.map((s) => `[${s}]`).join(" ");
}
