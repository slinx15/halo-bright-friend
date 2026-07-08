import { supabase } from "@/integrations/supabase/client";

export type DebtStatus = "open" | "paid";

export interface DebtItem {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount: number;
  status: DebtStatus;
  note: string;
  supplier: "Ivory";
  sourceType: "manual" | "ocr" | "snapshot";
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

export interface SupplierSnapshot {
  id: string;
  label: string;
  sourceImage: string | null;
  items: Array<Pick<DebtItem, "invoiceNumber" | "amount" | "invoiceDate" | "note" | "sourceType">>;
  createdAt: string;
}

export interface DebtSnapshotDiff {
  added: Array<{ invoiceNumber: string; amount: number }>;
  removed: Array<{ invoiceNumber: string; amount: number }>;
  changed: Array<{ invoiceNumber: string; before: number; after: number }>;
}

const DEBT_KEY = "rrc_ivory_debts_v1";
const PAYMENT_KEY = "rrc_ivory_debt_payments_v1";
const LIMIT_KEY = "rrc_ivory_limit_v1";
const SNAPSHOT_KEY = "rrc_ivory_snapshots_v1";
const BACKUP_KEY = "rrc_ivory_backup_v1";

const DEFAULT_LIMIT = 40_000_000;

// Cloud table access — types.ts hasn't regenerated yet, so cast the client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cloud = supabase as any;

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

// ---------- Local (sync) accessors ----------

export function getDebtLimit() {
  const stored = Number(localStorage.getItem(LIMIT_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_LIMIT;
}

export function setDebtLimit(limit: number) {
  const value = Math.max(0, Math.floor(limit));
  localStorage.setItem(LIMIT_KEY, String(value));
  void pushLimitToCloud(value);
}

export function getDebtItems(): DebtItem[] {
  return safeParse<DebtItem[]>(localStorage.getItem(DEBT_KEY), []);
}

export function getDebtPayments(): DebtPayment[] {
  return safeParse<DebtPayment[]>(localStorage.getItem(PAYMENT_KEY), []);
}

export function getSupplierSnapshots(): SupplierSnapshot[] {
  return safeParse<SupplierSnapshot[]>(localStorage.getItem(SNAPSHOT_KEY), []);
}

export function saveDebtItems(items: DebtItem[]) {
  localStorage.setItem(DEBT_KEY, JSON.stringify(items));
  void pushDebtsToCloud(items);
}

export function saveDebtPayments(items: DebtPayment[]) {
  localStorage.setItem(PAYMENT_KEY, JSON.stringify(items));
  void pushPaymentsToCloud(items);
}

export function saveSupplierSnapshots(items: SupplierSnapshot[]) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(items));
  void pushSnapshotsToCloud(items);
}

function saveLocalHutangState(input: {
  debts: DebtItem[];
  payments: DebtPayment[];
  snapshots: SupplierSnapshot[];
  limit?: number;
}) {
  localStorage.setItem(DEBT_KEY, JSON.stringify(input.debts));
  localStorage.setItem(PAYMENT_KEY, JSON.stringify(input.payments));
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(input.snapshots));
  if (typeof input.limit === "number") {
    localStorage.setItem(LIMIT_KEY, String(input.limit));
  }
}

function hasLocalDebtData() {
  return getDebtItems().length > 0 || getDebtPayments().length > 0 || getSupplierSnapshots().length > 0;
}

function backupLocalDebtData(reason: string) {
  try {
    const previous = safeParse<Array<Record<string, unknown>>>(localStorage.getItem(BACKUP_KEY), []);
    const entry = {
      reason,
      savedAt: new Date().toISOString(),
      debts: getDebtItems(),
      payments: getDebtPayments(),
      snapshots: getSupplierSnapshots(),
      limit: getDebtLimit(),
    };
    localStorage.setItem(BACKUP_KEY, JSON.stringify([entry, ...previous].slice(0, 10)));
  } catch (err) {
    console.error("[hutang] backupLocalDebtData failed", err);
  }
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
  sourceType?: DebtItem["sourceType"];
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
    sourceType: input.sourceType || "manual",
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
  const newPayment: DebtPayment = {
    id: uuid(),
    debtIds: debtIds.filter((id) => updated.some((item) => item.id === id)),
    amount: paidAmount,
    note,
    paidAt: now,
    createdAt: now,
  };
  payments.unshift(newPayment);
  saveDebtPayments(payments);

  return { items: updated, paidAmount };
}

export function createSupplierSnapshot(input: {
  label: string;
  sourceImage?: string | null;
  items: Array<Pick<DebtItem, "invoiceNumber" | "amount" | "invoiceDate" | "note" | "sourceType">>;
}) {
  const now = new Date().toISOString();
  return {
    id: uuid(),
    label: input.label.trim() || "Snapshot Supplier",
    sourceImage: input.sourceImage || null,
    items: input.items.map((item) => ({
      invoiceNumber: normalizeInvoiceNumber(item.invoiceNumber),
      amount: Math.max(0, Math.floor(item.amount)),
      invoiceDate: item.invoiceDate,
      note: item.note?.trim() || "",
      sourceType: item.sourceType || "snapshot",
    })),
    createdAt: now,
  } satisfies SupplierSnapshot;
}

export function saveSupplierSnapshot(snapshot: SupplierSnapshot) {
  const current = getSupplierSnapshots();
  saveSupplierSnapshots([snapshot, ...current]);
  return snapshot;
}

export function compareSupplierSnapshot(
  previousItems: Array<Pick<DebtItem, "invoiceNumber" | "amount">>,
  nextItems: Array<Pick<DebtItem, "invoiceNumber" | "amount">>,
) {
  const previousMap = new Map(previousItems.map((item) => [normalizeInvoiceNumber(item.invoiceNumber), item.amount]));
  const nextMap = new Map(nextItems.map((item) => [normalizeInvoiceNumber(item.invoiceNumber), item.amount]));

  const added: DebtSnapshotDiff["added"] = [];
  const removed: DebtSnapshotDiff["removed"] = [];
  const changed: DebtSnapshotDiff["changed"] = [];

  for (const [invoiceNumber, amount] of nextMap.entries()) {
    const previousAmount = previousMap.get(invoiceNumber);
    if (previousAmount == null) {
      added.push({ invoiceNumber, amount });
    } else if (previousAmount !== amount) {
      changed.push({ invoiceNumber, before: previousAmount, after: amount });
    }
  }

  for (const [invoiceNumber, amount] of previousMap.entries()) {
    if (!nextMap.has(invoiceNumber)) {
      removed.push({ invoiceNumber, amount });
    }
  }

  return { added, removed, changed } satisfies DebtSnapshotDiff;
}

export function ensureDefaultIvoryDebtData(defaultSnapshot: SupplierSnapshot, defaultItems: DebtItem[]) {
  const currentItems = getDebtItems();
  const currentSnapshots = getSupplierSnapshots();

  if (currentItems.length === 0) {
    saveDebtItems(defaultItems);
  }

  if (currentSnapshots.length === 0) {
    saveSupplierSnapshots([defaultSnapshot]);
  }
}

// ---------- Cloud sync ----------

type DebtRow = {
  id: string;
  invoice_number: string;
  amount: number;
  paid_amount: number;
  status: string;
  note: string | null;
  source_type: string;
  invoice_date: string;
  paid_at: string | null;
  source_image: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentRow = {
  id: string;
  debt_ids: string[] | null;
  amount: number;
  note: string | null;
  paid_at: string;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  label: string | null;
  source_image: string | null;
  items: SupplierSnapshot["items"] | null;
  created_at: string;
};

function rowToDebt(row: DebtRow): DebtItem {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    amount: row.amount,
    paidAmount: row.paid_amount,
    status: (row.status === "paid" ? "paid" : "open") as DebtStatus,
    note: row.note || "",
    supplier: "Ivory",
    sourceType: (row.source_type as DebtItem["sourceType"]) || "manual",
    invoiceDate: row.invoice_date,
    paidAt: row.paid_at,
    sourceImage: row.source_image,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function debtToRow(item: DebtItem) {
  return {
    id: item.id,
    invoice_number: item.invoiceNumber,
    amount: item.amount,
    paid_amount: item.paidAmount,
    status: item.status,
    note: item.note || "",
    source_type: item.sourceType,
    invoice_date: item.invoiceDate,
    paid_at: item.paidAt,
    source_image: item.sourceImage || null,
    updated_at: new Date().toISOString(),
  };
}

async function pushDebtsToCloud(items: DebtItem[]) {
  try {
    const { data: existing, error: fetchErr } = await cloud.from("ivory_debts").select("id");
    if (fetchErr) throw fetchErr;
    const existingIds = new Set((existing || []).map((row: { id: string }) => row.id));
    const nextIds = new Set(items.map((item) => item.id));
    const toDelete = [...existingIds].filter((id) => !nextIds.has(id as string));

    if (items.length > 0) {
      const { error: upsertErr } = await cloud.from("ivory_debts").upsert(items.map(debtToRow));
      if (upsertErr) throw upsertErr;
    }
    if (toDelete.length > 0) {
      const { error: delErr } = await cloud.from("ivory_debts").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }
  } catch (err) {
    console.error("[hutang] pushDebtsToCloud failed", err);
  }
}

async function pushPaymentsToCloud(items: DebtPayment[]) {
  try {
    const { data: existing, error: fetchErr } = await cloud.from("ivory_debt_payments").select("id");
    if (fetchErr) throw fetchErr;
    const existingIds = new Set((existing || []).map((row: { id: string }) => row.id));
    const nextIds = new Set(items.map((item) => item.id));
    const toInsert = items.filter((item) => !existingIds.has(item.id));
    const toDelete = [...existingIds].filter((id) => !nextIds.has(id as string));

    if (toInsert.length > 0) {
      const { error: insertErr } = await cloud.from("ivory_debt_payments").insert(
        toInsert.map((item) => ({
          id: item.id,
          debt_ids: item.debtIds,
          amount: item.amount,
          note: item.note || "",
          paid_at: item.paidAt,
          created_at: item.createdAt,
        })),
      );
      if (insertErr) throw insertErr;
    }
    if (toDelete.length > 0) {
      const { error: delErr } = await cloud.from("ivory_debt_payments").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }
  } catch (err) {
    console.error("[hutang] pushPaymentsToCloud failed", err);
  }
}

async function pushSnapshotsToCloud(items: SupplierSnapshot[]) {
  try {
    const { data: existing, error: fetchErr } = await cloud.from("ivory_debt_snapshots").select("id");
    if (fetchErr) throw fetchErr;
    const existingIds = new Set((existing || []).map((row: { id: string }) => row.id));
    const nextIds = new Set(items.map((item) => item.id));
    const toInsert = items.filter((item) => !existingIds.has(item.id));
    const toDelete = [...existingIds].filter((id) => !nextIds.has(id as string));

    if (toInsert.length > 0) {
      const { error: insertErr } = await cloud.from("ivory_debt_snapshots").insert(
        toInsert.map((item) => ({
          id: item.id,
          label: item.label,
          source_image: item.sourceImage,
          items: item.items,
          created_at: item.createdAt,
        })),
      );
      if (insertErr) throw insertErr;
    }
    if (toDelete.length > 0) {
      const { error: delErr } = await cloud.from("ivory_debt_snapshots").delete().in("id", toDelete);
      if (delErr) throw delErr;
    }
  } catch (err) {
    console.error("[hutang] pushSnapshotsToCloud failed", err);
  }
}

async function pushLimitToCloud(limit: number) {
  try {
    const { error } = await cloud
      .from("ivory_debt_settings")
      .upsert({ id: 1, debt_limit: limit, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch (err) {
    console.error("[hutang] pushLimitToCloud failed", err);
  }
}

export async function resetIvoryDebtData() {
  if (hasLocalDebtData()) {
    backupLocalDebtData("before-full-reset");
  }

  const [debtsRes, paymentsRes, snapshotsRes, settingsRes] = await Promise.all([
    cloud.from("ivory_debts").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    cloud.from("ivory_debt_payments").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    cloud.from("ivory_debt_snapshots").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    cloud
      .from("ivory_debt_settings")
      .upsert({ id: 1, debt_limit: DEFAULT_LIMIT, updated_at: new Date().toISOString() }),
  ]);

  if (debtsRes.error) throw debtsRes.error;
  if (paymentsRes.error) throw paymentsRes.error;
  if (snapshotsRes.error) throw snapshotsRes.error;
  if (settingsRes.error) throw settingsRes.error;

  saveLocalHutangState({
    debts: [],
    payments: [],
    snapshots: [],
    limit: DEFAULT_LIMIT,
  });
}

let syncPromise: Promise<void> | null = null;

/**
 * Pulls the authoritative hutang state from the backend into localStorage.
 * Call on Hutang / Dashboard mount so the browser cache reflects cross-device data.
 */
export async function syncDebtsFromCloud(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      const [debtsRes, paymentsRes, snapshotsRes, settingsRes] = await Promise.all([
        cloud.from("ivory_debts").select("*").order("created_at", { ascending: false }),
        cloud.from("ivory_debt_payments").select("*").order("paid_at", { ascending: false }),
        cloud.from("ivory_debt_snapshots").select("*").order("created_at", { ascending: false }),
        cloud.from("ivory_debt_settings").select("*").eq("id", 1).maybeSingle(),
      ]);

      if (debtsRes.error) throw debtsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (snapshotsRes.error) throw snapshotsRes.error;

      const debts: DebtItem[] = (debtsRes.data || []).map((row: DebtRow) => rowToDebt(row));
      const payments: DebtPayment[] = (paymentsRes.data || []).map((row: PaymentRow) => ({
        id: row.id,
        debtIds: row.debt_ids || [],
        amount: row.amount,
        note: row.note || "",
        paidAt: row.paid_at,
        createdAt: row.created_at,
      }));
      const snapshots: SupplierSnapshot[] = (snapshotsRes.data || []).map((row: SnapshotRow) => ({
        id: row.id,
        label: row.label || "",
        sourceImage: row.source_image,
        items: row.items || [],
        createdAt: row.created_at,
      }));

      if (hasLocalDebtData()) {
        backupLocalDebtData("before-cloud-sync");
      }
      saveLocalHutangState({
        debts,
        payments,
        snapshots,
        limit: settingsRes.data?.debt_limit || undefined,
      });
    } catch (err) {
      console.error("[hutang] syncDebtsFromCloud failed", err);
    } finally {
      syncPromise = null;
    }
  })();
  return syncPromise;
}
