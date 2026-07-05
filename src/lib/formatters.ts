export function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getStockStatus(jumlah: number): "kritis" | "warning" | "aman" {
  if (jumlah <= 5) return "kritis";
  if (jumlah <= 15) return "warning";
  return "aman";
}

export function getStockStatusColor(status: "kritis" | "warning" | "aman"): string {
  switch (status) {
    case "kritis": return "text-destructive bg-destructive/10";
    case "warning": return "text-warning bg-warning/10";
    case "aman": return "text-success bg-success/10";
  }
}

export const TUMPUKAN_OPTIONS = ["5", "10", "15", "20", "25"];
