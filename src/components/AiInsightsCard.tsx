import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabaseEnv";

export function AiInsightsCard() {
  const [manualRefresh, setManualRefresh] = useState(0);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["ai-insights", manualRefresh],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Belum login");
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/ai-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({}),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error" }));
        throw new Error(err.error || `Error ${res.status}`);
      }
      return res.json() as Promise<{ insights: string }>;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const handleRefresh = () => {
    setManualRefresh(prev => prev + 1);
  };

  return (
    <Card className="rounded-2xl shadow-md border-0 transition-all duration-150 hover:shadow-lg overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            AI Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary"
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {isLoading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[80%]" />
            <Skeleton className="h-4 w-[70%]" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span>Gagal memuat insight</span>
            <Button variant="outline" size="sm" className="ml-auto rounded-lg text-xs" onClick={() => refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : data?.insights ? (
          <div className="text-sm leading-relaxed space-y-1.5">
            <InsightRenderer text={data.insights} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Belum ada insight</p>
        )}
      </CardContent>
    </Card>
  );
}

function InsightRenderer({ text }: { text: string }) {
  const lines = text.split("\n").filter(l => l.trim());
  return (
    <>
      {lines.map((line, i) => {
        const cleaned = line.replace(/^[-*•]\s*/, "").trim();
        if (!cleaned) return null;
        // Bold formatting
        const formatted = cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });
        return (
          <div key={i} className="flex gap-2 items-start py-1">
            <span className="shrink-0 mt-0.5">•</span>
            <span>{formatted}</span>
          </div>
        );
      })}
    </>
  );
}
