import "dotenv/config";
import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";

const connection = getRedisConnection();

const availabilityQueue = new Queue("availability", { connection });
const draftReminderQueue = new Queue("draft-reminder", { connection });

export async function startScheduler(): Promise<void> {
  console.log("[scheduler] Starting cron jobs...");

  // Expire stale availability tokens every hour
  await availabilityQueue.add(
    "expire-tokens",
    { type: "expire_token" },
    {
      repeat: {
        pattern: "0 * * * *", // every hour
      },
      jobId: "expire-availability-tokens",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  // Bulk availability check every day at 9am UTC
  await availabilityQueue.add(
    "bulk-check",
    { type: "bulk_check" },
    {
      repeat: {
        pattern: "0 9 * * *",
      },
      jobId: "bulk-availability-check",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  // Draft reminders: check 15-min abandoned every 5 minutes
  await draftReminderQueue.add(
    "check-15m",
    { type: "check_15m" },
    {
      repeat: {
        pattern: "*/5 * * * *",
      },
      jobId: "draft-reminder-15m",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  // Draft reminders: check 6-hour abandoned every 30 minutes
  await draftReminderQueue.add(
    "check-6h",
    { type: "check_6h" },
    {
      repeat: {
        pattern: "*/30 * * * *",
      },
      jobId: "draft-reminder-6h",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  // Expire stale drafts daily at midnight
  await draftReminderQueue.add(
    "expire-stale",
    { type: "expire_stale" },
    {
      repeat: {
        pattern: "0 0 * * *",
      },
      jobId: "draft-expire-stale",
      removeOnComplete: true,
      removeOnFail: false,
    }
  );

  console.log("[scheduler] Cron jobs registered");
}
