import { useEffect, useRef } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";

const CRITICAL_THRESHOLD = 2; // days
const NOTIF_COOLDOWN_KEY = "stock-critical-notif-ts";
const COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours

export function useStockNotifications() {
  const { data: products } = useProducts();
  const { toast } = useToast();
  const notified = useRef(false);

  useEffect(() => {
    if (!products?.length || notified.current) return;

    // Check cooldown
    const lastNotif = localStorage.getItem(NOTIF_COOLDOWN_KEY);
    if (lastNotif && Date.now() - Number(lastNotif) < COOLDOWN_MS) return;

    // Find products with 0 stock that have prices (meaning they're active selling items)
    // Hanya tampilkan untuk kategori 2 Ons (stok fisik utama)
    const criticalItems = products.filter(p => {
      const stok = p.stock?.jumlah ?? 0;
      return stok === 0 && p.prices && p.prices.harga_normal > 0 && p.kategori === "2 Ons";
    });

    if (criticalItems.length === 0) return;

    notified.current = true;
    localStorage.setItem(NOTIF_COOLDOWN_KEY, String(Date.now()));

    const top3 = criticalItems.slice(0, 3).map(p => p.kode).join(", ");
    const more = criticalItems.length > 3 ? ` +${criticalItems.length - 3} lainnya` : "";

    toast({
      title: `🚨 ${criticalItems.length} produk stok habis!`,
      description: `${top3}${more} — segera restock`,
      variant: "destructive",
      duration: 8000,
    });

    // Also try browser notification if permitted
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("Stok Kritis!", {
          body: `${criticalItems.length} produk stok habis: ${top3}${more}`,
          icon: "/pwa-icon-192.png",
          tag: "stock-critical",
        });
      } catch { /* silent */ }
    }
  }, [products, toast]);
}

export function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}
