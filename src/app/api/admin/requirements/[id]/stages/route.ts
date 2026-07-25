import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import type { PipelineStage, ApiResponse } from "@/types";

const VALID_COLORS = ["blue", "green", "amber", "red", "purple", "gray", "pink", "cyan"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Return job-specific stages if they exist, otherwise return global defaults
    const jobStages = await query<PipelineStage>(
      `SELECT * FROM pipeline_stages WHERE requirement_id = $1 ORDER BY sort_order ASC`,
      [id]
    );

    if (jobStages.length > 0) {
      return NextResponse.json<ApiResponse<PipelineStage[]>>({ success: true, data: jobStages });
    }

    // Fall back to default stages
    const defaults = await query<PipelineStage>(
      `SELECT * FROM pipeline_stages WHERE requirement_id IS NULL AND is_default = TRUE ORDER BY sort_order ASC`
    );
    return NextResponse.json<ApiResponse<PipelineStage[]>>({ success: true, data: defaults });
  } catch (err) {
    console.error("[stages GET]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      stages?: Array<{ name: string; color?: string; sort_order?: number; maps_to_status?: string }>;
    };

    if (!Array.isArray(body.stages) || body.stages.length === 0) {
      return NextResponse.json({ error: "stages array required" }, { status: 400 });
    }

    // Check if job-specific stages already exist
    const existing = await query<{ id: string }>(
      "SELECT id FROM pipeline_stages WHERE requirement_id = $1",
      [id]
    );

    if (existing.length === 0) {
      // Copy default stages and add job-specific ones
      const defaultStages = await query<PipelineStage>(
        "SELECT * FROM pipeline_stages WHERE requirement_id IS NULL AND is_default = TRUE ORDER BY sort_order ASC"
      );
      for (const s of defaultStages) {
        await query(
          `INSERT INTO pipeline_stages (id, requirement_id, name, color, sort_order, maps_to_status, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,FALSE)`,
          [uuidv4(), id, s.name, s.color, s.sort_order, s.maps_to_status || null]
        );
      }
    }

    // Add new stages
    const inserted: PipelineStage[] = [];
    const maxOrder = await query<{ max: number }>(
      "SELECT COALESCE(MAX(sort_order), 0) AS max FROM pipeline_stages WHERE requirement_id = $1",
      [id]
    );
    let nextOrder = (maxOrder[0]?.max || 0) + 1;

    for (const s of body.stages) {
      if (!s.name?.trim()) continue;
      const [row] = await query<PipelineStage>(
        `INSERT INTO pipeline_stages (id, requirement_id, name, color, sort_order, maps_to_status)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          uuidv4(), id,
          s.name.trim(),
          VALID_COLORS.includes(s.color || "") ? s.color : "blue",
          s.sort_order ?? nextOrder++,
          s.maps_to_status || null,
        ]
      );
      inserted.push(row);
    }

    return NextResponse.json<ApiResponse<PipelineStage[]>>({ success: true, data: inserted }, { status: 201 });
  } catch (err) {
    console.error("[stages POST]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

// PUT: replace all stages for a job (full stage editor save)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json() as {
      stages: Array<{ id?: string; name: string; color?: string; sort_order: number; maps_to_status?: string }>;
    };

    if (!Array.isArray(body.stages)) {
      return NextResponse.json({ error: "stages array required" }, { status: 400 });
    }

    // Delete existing job-specific stages
    await query("DELETE FROM pipeline_stages WHERE requirement_id = $1", [id]);

    const saved: PipelineStage[] = [];
    for (const s of body.stages) {
      const [row] = await query<PipelineStage>(
        `INSERT INTO pipeline_stages (id, requirement_id, name, color, sort_order, maps_to_status)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [
          s.id || uuidv4(), id,
          s.name.trim(),
          VALID_COLORS.includes(s.color || "") ? s.color : "blue",
          s.sort_order,
          s.maps_to_status || null,
        ]
      );
      saved.push(row);
    }

    return NextResponse.json<ApiResponse<PipelineStage[]>>({ success: true, data: saved });
  } catch (err) {
    console.error("[stages PUT]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
