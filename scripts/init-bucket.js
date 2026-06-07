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
  let retries = 15;
  while (retries > 0) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`[init-bucket] Bucket "${bucket}" already exists.`);
      return;
    } catch (err) {
      const code = err?.name || err?.Code || "";
      if (code === "NotFound" || code === "NoSuchBucket" || err?.$metadata?.httpStatusCode === 404) {
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        console.log(`[init-bucket] Bucket "${bucket}" created.`);
        return;
      }
      retries--;
      if (retries === 0) {
        console.error("[init-bucket] Could not reach S3/MinIO:", err?.message || err);
        process.exit(1);
      }
      console.log(`[init-bucket] Waiting for S3/MinIO... (${retries} retries left)`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

ensureBucket().catch((err) => {
  console.error("[init-bucket] Fatal:", err);
  process.exit(1);
});
