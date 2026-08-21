// Halaman yang boleh dibuka dalam Mode Tamu (hanya melihat, tidak bisa mengubah).
export const GUEST_ALLOWED_PATHS = [
  "/",
  "/stok",
  "/shopee",
  "/analisa",
  "/laporan",
  "/keuangan",
] as const;

export function isGuestAllowedPath(pathname: string) {
  return (GUEST_ALLOWED_PATHS as readonly string[]).includes(pathname);
}
