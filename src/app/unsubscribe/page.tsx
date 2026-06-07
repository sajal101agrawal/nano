export const dynamic = "force-dynamic";
import { query } from "@/lib/db";
import Link from "next/link";
import { CheckCircle, XCircle, RotateCcw } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ email?: string; resubscribe?: string }>;
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { email: encodedEmail, resubscribe } = await searchParams;

  let email = "";
  let action: "unsubscribed" | "resubscribed" | "invalid" = "invalid";

  try {
    if (encodedEmail) {
      const decoded = JSON.parse(Buffer.from(encodedEmail, "base64url").toString());
      email = decoded.email || "";
    }
  } catch {
    // invalid token
  }

  if (!email) {
    return <UnsubscribeResult action="invalid" email="" encodedEmail="" />;
  }

  if (resubscribe === "1") {
    await query("DELETE FROM suppression_list WHERE email = $1", [email.toLowerCase()]);
    action = "resubscribed";
  } else {
    await query(
      "INSERT INTO suppression_list (email, reason) VALUES ($1, 'unsubscribed') ON CONFLICT (email) DO NOTHING",
      [email.toLowerCase()]
    );
    action = "unsubscribed";
  }

  return <UnsubscribeResult action={action} email={email} encodedEmail={encodedEmail || ""} />;
}

function UnsubscribeResult({
  action,
  email,
  encodedEmail,
}: {
  action: "unsubscribed" | "resubscribed" | "invalid";
  email: string;
  encodedEmail?: string;
}) {
  const config = {
    unsubscribed: {
      Icon: CheckCircle,
      iconClass: "text-text-muted",
      bgClass: "bg-bg-hover",
      title: "Unsubscribed",
    },
    resubscribed: {
      Icon: RotateCcw,
      iconClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      title: "Re-subscribed",
    },
    invalid: {
      Icon: XCircle,
      iconClass: "text-red-400",
      bgClass: "bg-red-500/10",
      title: "Invalid link",
    },
  }[action];

  const { Icon, iconClass, bgClass, title } = config;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center">
        <div className={`w-14 h-14 rounded-2xl ${bgClass} flex items-center justify-center mx-auto mb-5`}>
          <Icon className={`w-7 h-7 ${iconClass}`} />
        </div>

        <h1 className="font-display text-xl font-bold text-text-light mb-3">{title}</h1>

        {action === "unsubscribed" && (
          <>
            <p className="text-text-dim text-sm mb-6">
              <strong className="text-text-light">{email}</strong> has been removed from our outreach list.
              You will still receive essential transactional emails.
            </p>
            <a
              href={`/unsubscribe?email=${encodedEmail}&resubscribe=1`}
              className="text-xs text-text-muted hover:text-primary transition-colors underline"
            >
              Changed your mind? Re-subscribe
            </a>
          </>
        )}

        {action === "resubscribed" && (
          <p className="text-text-dim text-sm">
            <strong className="text-text-light">{email}</strong> has been added back to our list.
          </p>
        )}

        {action === "invalid" && (
          <p className="text-text-dim text-sm">
            This unsubscribe link is invalid or has expired.
          </p>
        )}

        <div className="mt-8 pt-5 border-t border-border">
          <Link href="/" className="text-xs text-text-muted hover:text-primary transition-colors">
            Nano by Sajal Tech
          </Link>
        </div>
      </div>
    </div>
  );
}
