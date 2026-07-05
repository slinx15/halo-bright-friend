import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** KPI cards row — horizontal on mobile, grid on desktop */
export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="rounded-2xl border bg-card shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Chart placeholder */
export function ChartSkeleton() {
  return (
    <Card className="rounded-2xl shadow-md border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-5 w-40" />
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4">
        <div className="h-56 md:h-60 flex items-end gap-2 px-4">
          {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Card list skeleton — mimics Boss Cards */
export function CardListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <Skeleton className="h-6 w-10" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[1, 2, 3].map(j => (
              <div key={j} className="space-y-1">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Table skeleton for desktop */
export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 px-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-2 py-2">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Alert / Stok Rendah card skeleton */
export function AlertCardSkeleton() {
  return (
    <Card className="rounded-2xl shadow-md border-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="pt-1 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-2.5 rounded-xl border-l-[3px] border-l-muted space-y-1.5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-8" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Full page skeleton with header */
export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto w-full animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** Quick Actions skeleton */
export function QuickActionsSkeleton() {
  return (
    <Card className="rounded-2xl shadow-md border-0">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex flex-col items-center gap-2.5 py-5 rounded-xl border border-border/60">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Dashboard full loading skeleton — mirrors current layout */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 pb-24 md:space-y-6 md:p-6 md:pb-6 animate-in fade-in duration-300">
      {/* Header greeting */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
        <Skeleton className="h-6 w-14 rounded-full" />
      </div>
      {/* Hero KPI grid */}
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="col-span-2 h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="col-span-3 h-20 rounded-2xl" />
      </div>
      {/* Critical + AI */}
      <AlertCardSkeleton />
      <Skeleton className="h-32 w-full rounded-2xl" />
      {/* Command center */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      {/* Barang masuk */}
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="col-span-2 h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      {/* Chart + Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <ChartSkeleton />
        </div>
        <QuickActionsSkeleton />
      </div>
    </div>
  );
}


/** Stok page loading skeleton */
export function StokSkeleton() {
  return (
    <PageSkeleton>
      <KpiSkeleton />
      <Card className="boss-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-full md:w-64 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent>
          <CardListSkeleton />
        </CardContent>
      </Card>
    </PageSkeleton>
  );
}

/** Transaction page skeleton (Masuk/Keluar) */
export function TransactionSkeleton() {
  return (
    <PageSkeleton>
      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border/60 p-3.5 space-y-2.5">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
              <div className="w-20 space-y-1">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            </div>
          </div>
          <Skeleton className="h-8 w-32 rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
      <Card className="rounded-2xl shadow-md border-0">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <CardListSkeleton count={3} />
        </CardContent>
      </Card>
    </PageSkeleton>
  );
}

/** Opname page skeleton */
export function OpnameSkeleton() {
  return (
    <PageSkeleton>
      <Card className="boss-card">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </CardContent>
      </Card>
      <Card className="boss-card">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <CardListSkeleton count={3} />
        </CardContent>
      </Card>
    </PageSkeleton>
  );
}

/** Analisa page skeleton */
export function AnalisaSkeleton() {
  return (
    <PageSkeleton>
      <Skeleton className="h-10 w-full rounded-xl" />
      <KpiSkeleton />
      <Card className="boss-card">
        <CardContent className="p-4">
          <CardListSkeleton count={5} />
        </CardContent>
      </Card>
    </PageSkeleton>
  );
}

/** Produk page skeleton */
export function ProdukSkeleton() {
  return (
    <PageSkeleton>
      <Card className="boss-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-9 w-full md:w-64 rounded-lg" />
          </div>
        </CardHeader>
        <CardContent>
          <CardListSkeleton />
        </CardContent>
      </Card>
    </PageSkeleton>
  );
}
