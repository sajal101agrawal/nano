import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

function getConnection(): ConnectionOptions {
  // Prefer individual Railway variables
  if (process.env.REDISHOST) {
    return {
      host: process.env.REDISHOST,
      port: parseInt(process.env.REDISPORT || "6379"),
      username: process.env.REDISUSER || undefined,
      password: process.env.REDISPASSWORD || undefined,
      maxRetriesPerRequest: null,
    };
  }
  
  // Fall back to REDIS_URL
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: url.hostname,
    port: parseInt(url.port || "6379"),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    maxRetriesPerRequest: null,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

const connection = getConnection();

// Queue definitions
export const cvParseQueue = new Queue("cv-parse", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const emailQueue = new Queue("email", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const matchQueue = new Queue("match", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "fixed", delay: 5000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const availabilityQueue = new Queue("availability", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

export const enrichmentQueue = new Queue("enrichment", {
  connection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: { age: 24 * 3600 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

// Job type interfaces
export interface CVParseJobData {
  profileId: string;
  candidateId?: string;
  applicationId?: string;
  resourceId?: string;
  cvUrl: string;
  cvKey: string;
  mimeType: string;
  targetType?: "candidate" | "staffing_resource";
}

export interface EmailJobData {
  messageId: string;
  to: string;
  subject: string;
  html: string;
  stream: "transactional" | "availability" | "outreach";
  threadId?: string;
  tags?: Array<{ name: string; value: string }>;
  cc?: string[];
  attachments?: Array<{ filename: string; content: string; contentType: string }>;
}

export interface MatchJobData {
  requirementId: string;
  topN?: number;
}

export interface AvailabilityJobData {
  type: "send_check" | "expire_token" | "bulk_check";
  candidateId?: string;
  requirementId?: string;
  tokenId?: string;
}

export interface EnrichmentJobData {
  prospectId: string;
  action: "find_email" | "enrich_profile";
}

export async function enqueueCVParse(data: CVParseJobData): Promise<string> {
  const job = await cvParseQueue.add("parse", data, {
    jobId: `cv-${data.profileId}`,
  });
  return job.id || "";
}

export async function enqueueEmail(data: EmailJobData): Promise<string> {
  const job = await emailQueue.add("send", data);
  return job.id || "";
}

export async function enqueueMatch(data: MatchJobData): Promise<string> {
  const job = await matchQueue.add("compute", data, {
    jobId: `match-${data.requirementId}`,
  });
  return job.id || "";
}

export async function enqueueAvailabilityCheck(
  data: AvailabilityJobData
): Promise<string> {
  const job = await availabilityQueue.add("check", data);
  return job.id || "";
}

export async function enqueueEnrichment(
  data: EnrichmentJobData
): Promise<string> {
  const job = await enrichmentQueue.add("enrich", data);
  return job.id || "";
}
