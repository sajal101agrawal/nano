#!/usr/bin/env node
// Ensures the S3 bucket exists — idempotent, safe to run on every boot.
require("dotenv").config();

const { S3Client, CreateBucketCommand, HeadBucketCommand } = require("@aws-sdk/client-s3");

const endpoint = process.env.S3_ENDPOINT;
const bucket = process.env.S3_BUCKET_NAME || "nano-cvs";
const region = process.env.S3_REGION || "us-east-1";

if (!endpoint) {
  console.log("[init-bucket] S3_ENDPOINT not set, skipping bucket init.");
  process.exit(0);
}

console.log(`[init-bucket] Connecting to ${endpoint}, bucket: ${bucket}`);

const s3 = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

async function ensureBucket() {
  let retries = 30; // More retries for Railway internal networking
  while (retries > 0) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`[init-bucket] Bucket "${bucket}" already exists.`);
      return;
    } catch (err) {
      const code = err?.name || err?.Code || "";
      if (code === "NotFound" || code === "NoSuchBucket" || err?.$metadata?.httpStatusCode === 404) {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: bucket }));
          console.log(`[init-bucket] Bucket "${bucket}" created.`);
          return;
        } catch (createErr) {
          // Bucket might have been created by another instance
          if (createErr?.name === "BucketAlreadyOwnedByYou" || createErr?.name === "BucketAlreadyExists") {
            console.log(`[init-bucket] Bucket "${bucket}" already exists (race condition).`);
            return;
          }
          throw createErr;
        }
      }
      retries--;
      if (retries === 0) {
        // Don't fail startup if MinIO is temporarily unavailable
        console.warn("[init-bucket] Could not reach S3/MinIO after retries, continuing anyway:", err?.message || err);
        console.warn("[init-bucket] The app will work once MinIO becomes available.");
        return;
      }
      console.log(`[init-bucket] Waiting for S3/MinIO... (${retries} retries left)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

ensureBucket().catch((err) => {
  // Don't block startup on S3 init failure
  console.warn("[init-bucket] Warning:", err?.message || err);
  console.warn("[init-bucket] Continuing startup without bucket verification.");
});
