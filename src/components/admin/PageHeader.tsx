import { cn } from "@/lib/cn";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  count?: number | string;
  action?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  count,
  action,
  backHref,
  backLabel,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-dim mb-2 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M7.5 9L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {backLabel || "Back"}
          </Link>
        )}
        <div className="flex items-center gap-3">
          <h1 className="section-title">{title}</h1>
          {count !== undefined && (
            <span className="badge badge-gray text-xs">{count}</span>
          )}
        </div>
        {subtitle && <p className="section-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
