import "dotenv/config";
import { Worker } from "bullmq";
import { cvParseProcessor } from "./processors/cvParse";
import { emailProcessor } from "./processors/email";
import { matchProcessor } from "./processors/match";
import { availabilityProcessor } from "./processors/availability";
import { draftReminderProcessor } from "./processors/draftReminder";
import { startScheduler } from "./scheduler";
import { getRedisConnection } from "./redis";

const connection = getRedisConnection();
console.log(`[worker] Connecting to Redis at ${new URL(process.env.REDIS_URL || "redis://localhost:6379").hostname}`);

const workerConfig = {
  connection,
  concurrency: 5,
};

console.log("[worker] Starting nano background worker...");

const cvWorker = new Worker("cv-parse", cvParseProcessor, {
  ...workerConfig,
  concurrency: 3,
});

const emailWorker = new Worker("email", emailProcessor, {
  ...workerConfig,
  concurrency: 10,
});

const matchWorker = new Worker("match", matchProcessor, {
  ...workerConfig,
  concurrency: 2,
});

const availabilityWorker = new Worker(
  "availability",
  availabilityProcessor,
  workerConfig
);

const draftReminderWorker = new Worker(
  "draft-reminder",
  draftReminderProcessor,
  { ...workerConfig, concurrency: 1 }
);

for (const [name, worker] of [
  ["cv-parse", cvWorker],
  ["email", emailWorker],
  ["match", matchWorker],
  ["availability", availabilityWorker],
  ["draft-reminder", draftReminderWorker],
] as const) {
  worker.on("completed", (job) => {
    console.log(`[worker:${name}] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `[worker:${name}] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
      err.message
    );
  });

  worker.on("error", (err) => {
    console.error(`[worker:${name}] Worker error:`, err.message);
  });
}

startScheduler().catch(console.error);

console.log("[worker] All workers running. Waiting for jobs...");

async function shutdown() {
  console.log("[worker] Shutting down gracefully...");
  await Promise.all([
    cvWorker.close(),
    emailWorker.close(),
    matchWorker.close(),
    availabilityWorker.close(),
    draftReminderWorker.close(),
  ]);
  console.log("[worker] All workers stopped.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
