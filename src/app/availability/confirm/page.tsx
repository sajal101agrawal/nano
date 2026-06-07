export const dynamic = "force-dynamic";
import { query, queryOne } from "@/lib/db";
import Link from "next/link";
import { CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ token?: string; s?: string }>;
}

export default async function AvailabilityConfirmPage({ searchParams }: PageProps) {
  const { token, s: status } = await searchParams;

  if (!token || !status || !["available", "unavailable"].includes(status)) {
    return <AvailabilityResult type="invalid" />;
  }

  const event = await queryOne<{
    id: string;
    candidate_id: string;
    token_used: boolean;
    expires_at: string;
  }>(
    "SELECT id, candidate_id, token_used, expires_at FROM availability_events WHERE token = $1",
    [token]
  );

  if (!event) return <AvailabilityResult type="invalid" />;
  if (event.token_used) return <AvailabilityResult type="already_used" status={status as "available" | "unavailable"} />;
  if (new Date(event.expires_at) < new Date()) return <AvailabilityResult type="expired" />;

  await query(
    "UPDATE availability_events SET status = $1, token_used = TRUE, responded_at = NOW() WHERE id = $2",
    [status, event.id]
  );
  await query(
    "UPDATE candidates SET availability_status = $1, updated_at = NOW() WHERE id = $2",
    [status, event.candidate_id]
  );

  return <AvailabilityResult type="success" status={status as "available" | "unavailable"} />;
}

function AvailabilityResult({
  type,
  status,
}: {
  type: "success" | "invalid" | "expired" | "already_used";
  status?: "available" | "unavailable";
}) {
  const config = {
    success: {
      Icon: CheckCircle,
      iconClass: status === "available" ? "text-emerald-400" : "text-text-muted",
      bgClass: status === "available" ? "bg-emerald-500/10" : "bg-bg-hover",
      title: status === "available" ? "You're marked as available" : "Got it, noted",
      message: status === "available"
        ? "We've updated your status. Our team will reach out if there's a strong match."
        : "We've noted that you're not available right now. We'll check back in a few weeks.",
    },
    invalid: {
      Icon: XCircle,
      iconClass: "text-red-400",
      bgClass: "bg-red-500/10",
      title: "Invalid link",
      message: "This availability link is invalid. Please wait for a new email from us.",
    },
    expired: {
      Icon: AlertCircle,
      iconClass: "text-amber-400",
      bgClass: "bg-amber-500/10",
      title: "Link expired",
      message: "This availability link has expired. We'll send a fresh one soon.",
    },
    already_used: {
      Icon: CheckCircle,
      iconClass: "text-text-muted",
      bgClass: "bg-bg-hover",
      title: "Already responded",
      message: "Your availability has already been recorded. Thank you!",
    },
  }[type];

  const { Icon, iconClass, bgClass, title, message } = config;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className={`w-14 h-14 rounded-2xl ${bgClass} flex items-center justify-center mx-auto mb-5`}>
          <Icon className={`w-7 h-7 ${iconClass}`} />
        </div>
        <h1 className="font-display text-xl font-bold text-text-light mb-3">{title}</h1>
        <p className="text-text-dim text-sm leading-relaxed mb-8">{message}</p>
        {type === "success" && status === "available" && (
          <Link href="/jobs" className="btn btn-secondary btn-sm inline-flex">
            Browse open roles
          </Link>
        )}
        <div className="mt-8 pt-5 border-t border-border">
          <span className="text-xs text-text-muted">Nano by Sajal Tech</span>
        </div>
      </div>
    </div>
  );
}
