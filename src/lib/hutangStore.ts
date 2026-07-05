export type DebtStatus = "open" | "paid";

export interface DebtItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  status: DebtStatus;
  note: string;
  supplier: "Ivory";
  invoiceDate: string;
  paidAt: string | null;
  sourceImage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtPayment {
  id: string;
  debtIds: string[];
  amount: number;
  note: string;
  paidAt: string;
  createdAt: string;
}

export interface DebtSummary {
  totalDebt: number;
  totalPaid: number;
  openDebt: number;
  remainingLimit: number;
  activeCount: number;
  paidCount: number;
}

const DEBT_KEY = "rrc_ivory_debts_v1";
const PAYMENT_KEY = "rrc_ivory_debt_payments_v1";
const LIMIT_KEY = "rrc_ivory_limit_v1";

const DEFAULT_LIMIT = 40_000_000;

function uuid() {
  return globalThis.crypto?.randomUUID?.() ?? `debt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getDebtLimit() {
  const stored = Number(localStorage.getItem(LIMIT_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_LIMIT;
}

export function setDebtLimit(limit: number) {
  localStorage.setItem(LIMIT_KEY, String(Math.max(0, Math.floor(limit))));
}

export function getDebtItems(): DebtItem[] {
  return safeParse<DebtItem[]>(localStorage.getItem(DEBT_KEY), []);
}

export function getDebtPayments(): DebtPayment[] {
  return safeParse<DebtPayment[]>(localStorage.getItem(PAYMENT_KEY), []);
}

export function saveDebtItems(items: DebtItem[]) {
  localStorage.setItem(DEBT_KEY, JSON.stringify(items));
}

export function saveDebtPayments(items: DebtPayment[]) {
  localStorage.setItem(PAYMENT_KEY, JSON.stringify(items));
}

export function getDebtSummary(items: DebtItem[] = getDebtItems()): DebtSummary {
  const totalDebt = items.reduce((sum, item) => sum + item.amount, 0);
  const totalPaid = items.reduce((sum, item) => sum + item.paidAmount, 0);
  const openDebt = items.filter((item) => item.status === "open").reduce((sum, item) => sum + item.amount, 0);
  const limit = getDebtLimit();

  return {
    totalDebt,
    totalPaid,
    openDebt,
    remainingLimit: Math.max(0, limit - openDebt),
    activeCount: items.filter((item) => item.status === "open").length,
    paidCount: items.filter((item) => item.status === "paid").length,
  };
}

export function normalizeInvoiceNumber(raw: string) {
  return raw
    .toUpperCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9/-]/g, "");
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function createDebtItem(input: {
  invoiceNumber: string;
  amount: number;
  invoiceDate: string;
  note?: string;
  sourceImage?: string | null;
}): DebtItem {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    invoiceNumber: normalizeInvoiceNumber(input.invoiceNumber),
    amount: Math.max(0, Math.floor(input.amount)),
    paidAmount: 0,
    status: "open",
    note: input.note?.trim() || "",
    supplier: "Ivory",
    invoiceDate: input.invoiceDate,
    paidAt: null,
    sourceImage: input.sourceImage || null,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertDebtItem(item: DebtItem) {
  const items = getDebtItems();
  const idx = items.findIndex((existing) => existing.id === item.id);
  const next = { ...item, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    items[idx] = next;
  } else {
    items.unshift(next);
  }
  saveDebtItems(items);
  return next;
}

export function markDebtsPaid(debtIds: string[], note = "") {
  const items = getDebtItems();
  const now = new Date().toISOString();
  let paidAmount = 0;

  const updated = items.map((item) => {
    if (!debtIds.includes(item.id) || item.status === "paid") return item;
    paidAmount += item.amount;
    return {
      ...item,
      paidAmount: item.amount,
      status: "paid" as const,
      paidAt: now,
      updatedAt: now,
      note: item.note ? item.note : note,
    };
  });

  saveDebtItems(updated);

  const payments = getDebtPayments();
  payments.unshift({
    id: uuid(),
    debtIds: debtIds.filter((id) => updated.some((item) => item.id === id)),
    amount: paidAmount,
    note,
    paidAt: now,
    createdAt: now,
  });
  saveDebtPayments(payments);

  return { items: updated, paidAmount };
}

