import { cn } from "@/lib/cn";

interface BadgeProps {
  variant?: "blue" | "green" | "red" | "amber" | "gray" | "purple" | "indigo";
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "gray", dot = false, children, className }: BadgeProps) {
  return (
    <span className={cn("badge", `badge-${variant}`, dot && "badge-dot", className)}>
      {children}
    </span>
  );
}

// Skeleton
interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
}

export function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton", className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 rounded"
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("card p-5 space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-lg" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-3 w-20 rounded" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

// Spinner
export function Spinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-7 h-7" };
  return (
    <div
      className={cn(
        "rounded-full border-2 border-current border-t-transparent animate-spin",
        sizes[size],
        className
      )}
    />
  );
}

// Empty state
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      {icon && (
        <div className="empty-icon">
          <div className="text-text-muted">{icon}</div>
        </div>
      )}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// Avatar
interface AvatarProps {
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const avatarColors = [
  "bg-blue-500/20 text-blue-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-purple-500/20 text-purple-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
  "bg-cyan-500/20 text-cyan-400",
];

function getAvatarColor(name: string): string {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return avatarColors[code % avatarColors.length];
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

export function Avatar({ name = "?", size = "md", className }: AvatarProps) {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-12 h-12 text-base" };
  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center font-semibold font-display flex-shrink-0",
        sizes[size],
        getAvatarColor(name),
        className
      )}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

// Card
interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: boolean;
  onClick?: () => void;
}

export function Card({ children, className, hover = false, padding = true, onClick }: CardProps) {
  return (
    <div
      className={cn(
        "card",
        hover && "card-hover",
        onClick && "card-interactive cursor-pointer",
        padding && "p-5",
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// Score bar
interface ScoreBarProps {
  score: number; // 0-100
  className?: string;
}

export function ScoreBar({ score, className }: ScoreBarProps) {
  const color =
    score >= 70
      ? "bg-emerald-500"
      : score >= 45
      ? "bg-amber-500"
      : "bg-red-400";
  return (
    <div className={cn("score-bar w-full", className)}>
      <div
        className={cn("score-fill", color)}
        style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
      />
    </div>
  );
}
