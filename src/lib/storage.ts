import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: !!process.env.S3_ENDPOINT,
});

const BUCKET = process.env.S3_BUCKET_NAME || "nano-cvs";
const MAX_SIZE_BYTES = (parseInt(process.env.MAX_CV_SIZE_MB || "10") * 1024 * 1024);

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
];

export async function uploadCV(
  buffer: Buffer,
  originalFilename: string,
  mimeType: string
): Promise<{ url: string; key: string; filename: string; size: number }> {
  if (buffer.length > MAX_SIZE_BYTES) {
    throw new Error(
      `File too large. Maximum size is ${process.env.MAX_CV_SIZE_MB || 10}MB`
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw new Error("Only PDF and DOCX files are allowed");
  }

  const ext = originalFilename.split(".").pop()?.toLowerCase() || "pdf";
  const key = `cvs/${uuidv4()}.${ext}`;

  let retries = 3;
  while (retries > 0) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: buffer,
          ContentType: mimeType,
          ContentDisposition: `attachment; filename="${originalFilename}"`,
          Metadata: {
            "original-filename": originalFilename,
          },
        })
      );

      const url = `${process.env.S3_ENDPOINT || ""}/${BUCKET}/${key}`;
      return { url, key, filename: originalFilename, size: buffer.length };
    } catch (err) {
      retries--;
      if (retries === 0) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw new Error("Upload failed after retries");
}

export async function getSignedDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteCV(key: string): Promise<void> {
  try {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (err) {
    console.warn("[storage] Delete failed:", err);
  }
}

export function extractKeyFromUrl(url: string): string {
  const endpoint = process.env.S3_ENDPOINT || "";
  const bucket = BUCKET;
  const prefix = `${endpoint}/${bucket}/`;
  return url.startsWith(prefix) ? url.slice(prefix.length) : url;
}
