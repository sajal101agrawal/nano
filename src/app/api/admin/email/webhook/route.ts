import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { addToSuppression } from "@/lib/email";
import { v4 as uuidv4 } from "uuid";
import { createNotification } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, data } = body;

    if (!type) return NextResponse.json({ ok: true });

    const emailId = data?.email_id;
    if (!emailId) return NextResponse.json({ ok: true });

    const message = await queryOne<{ id: string; email_to: string; target_type: string; target_id: string }>(
      "SELECT id, email_to, target_type, target_id FROM outreach_messages WHERE esp_message_id = $1",
      [emailId]
    );

    if (!message) return NextResponse.json({ ok: true });

    const eventMap: Record<string, string> = {
      "email.delivered": "delivered",
      "email.opened": "opened",
      "email.clicked": "clicked",
      "email.bounced": "bounced",
      "email.complained": "complained",
    };

    const eventType = eventMap[type] || type.replace("email.", "");

    await query(
      `INSERT INTO email_events (id, message_id, event_type, occurred_at, metadata)
       VALUES ($1, $2, $3, NOW(), $4)`,
      [uuidv4(), message.id, eventType, JSON.stringify(data)]
    );

    await query(
      "UPDATE outreach_messages SET status = $1 WHERE id = $2",
      [eventType === "complained" ? "bounced" : eventType, message.id]
    );

    // Auto-suppress on bounce or complaint
    if (eventType === "bounced" || eventType === "complained") {
      await addToSuppression(
        message.email_to,
        eventType === "complained" ? "complained" : "bounced"
      );
    }

    // Notify admin on reply
    if (type === "email.replied" || eventType === "replied") {
      await createNotification("email_reply", "Email reply received", {
        entityType: message.target_type,
        entityId: message.target_id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[email/webhook]", err);
    return NextResponse.json({ ok: true });
  }
}
