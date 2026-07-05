import { Badge } from "@/components/ui/badge";
import { getMaxStack } from "@/lib/tumpukanUtils";

interface TumpukanBadgesProps {
  stacks: number[];
  kode: string;
  kategori?: string;
  compact?: boolean;
}

export function TumpukanBadges({ stacks, kode, kategori, compact = false }: TumpukanBadgesProps) {
  if (!stacks || stacks.length === 0) {
    return <span className="text-muted-foreground text-xs">-</span>;
  }

  const maxStack = getMaxStack(kode, kategori);
  const isSpecial = maxStack >= 32; // 32 (5 Ons) or 50 (BLCK/WHT)

  return (
    <div className="flex flex-wrap gap-1">
      {stacks.map((size, i) => (
        <Badge
          key={i}
          variant="secondary"
          className={`text-xs font-mono px-1.5 py-0 ${
            isSpecial
              ? "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/20"
              : size === maxStack
              ? "bg-primary/10 text-primary border-primary/20"
              : "bg-muted text-muted-foreground"
          } ${compact ? "text-[10px]" : ""}`}
        >
          {size}
        </Badge>
      ))}
    </div>
  );
}
