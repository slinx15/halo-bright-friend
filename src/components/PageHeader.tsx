import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ icon: Icon, iconColor, iconBg, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm", className)}>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3.5 sm:items-center">
          <div className={`shrink-0 rounded-2xl p-3 shadow-sm ${iconBg}`}>
            <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
          </div>
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-xl">{title}</h1>
            <p className="text-xs font-medium text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
