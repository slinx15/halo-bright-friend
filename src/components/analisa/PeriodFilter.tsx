import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarDays } from "lucide-react";

interface PeriodFilterProps {
  period: string;
  onPeriodChange: (value: string) => void;
}

export const PERIOD_OPTIONS = [
  { value: "7", label: "7 hari", recent: 7, older: 14 },
  { value: "14", label: "14 hari", recent: 14, older: 28 },
  { value: "30", label: "30 hari", recent: 30, older: 60 },
];

export function getPeriodDays(period: string) {
  const opt = PERIOD_OPTIONS.find((o) => o.value === period) ?? PERIOD_OPTIONS[0];
  return { recentDays: opt.recent, olderDays: opt.older };
}

export function PeriodFilter({ period, onPeriodChange }: PeriodFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="h-4 w-4 text-muted-foreground" />
      <Label className="text-sm text-muted-foreground whitespace-nowrap">Periode:</Label>
      <Select value={period} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
