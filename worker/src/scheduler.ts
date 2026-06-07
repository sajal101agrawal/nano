import "dotenv/config";
import { Queue } from "bullmq";

const connection = {
  host: new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname,
  port: parseInt(
    new URL(process.env.REDIS_URL || "redis://localhost:6379").port || "6379"
  ),
};

const availabilityQueue = new Queue("availability", { connection });

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

  console.log("[scheduler] Cron jobs registered");
}
