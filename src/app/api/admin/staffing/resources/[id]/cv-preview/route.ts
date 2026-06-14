import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { extractKeyFromUrl } from "@/lib/storage";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getAdminSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const profile = await queryOne<{ raw_cv_url: string; raw_cv_filename: string | null }>(
      `SELECT raw_cv_url, raw_cv_filename
       FROM staffing_resource_profiles
       WHERE resource_id = $1 AND is_current = TRUE`,
      [id]
    );

    if (!profile?.raw_cv_url) return new NextResponse("No CV found", { status: 404 });

    const key = extractKeyFromUrl(profile.raw_cv_url);
    const ext = key.split(".").pop()?.toLowerCase() || "";
    const contentTypeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
    };
    let contentType = contentTypeMap[ext] || "application/octet-stream";

    try {
      const head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      if (head.ContentType) contentType = head.ContentType;
    } catch {}

    const s3Response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!s3Response.Body) return new NextResponse("File not found in storage", { status: 404 });

    const filename = profile.raw_cv_filename || `cv.${ext}`;
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (err) {
    return new NextResponse(err instanceof Error ? err.message : "Internal error", { status: 500 });
  }
}
