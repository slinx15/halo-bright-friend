import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
}

export function PageHeader({ icon: Icon, iconColor, iconBg, title, subtitle }: PageHeaderProps) {
  return (
    <div className="flex items-start gap-3.5 sm:items-center">
      <div className={`shrink-0 rounded-2xl p-3 shadow-sm ${iconBg}`}>
        <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${iconColor}`} />
      </div>
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-lg font-extrabold leading-tight tracking-tight sm:text-xl">{title}</h1>
        <p className="text-xs font-medium text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
