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
    <div className="flex items-center gap-3.5">
      <div className={`p-3 rounded-2xl ${iconBg} shadow-sm`}>
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </div>
      <div className="space-y-0.5">
        <h1 className="text-xl font-extrabold tracking-tight leading-tight">{title}</h1>
        <p className="text-muted-foreground text-xs font-medium">{subtitle}</p>
      </div>
    </div>
  );
}
