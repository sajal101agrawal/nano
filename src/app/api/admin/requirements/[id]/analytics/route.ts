import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";
import type { ApiResponse } from "@/types";

const STATUS_ORDER = ["applied", "shortlisted", "contacted", "in_discussion", "offered", "placed"];

type FunnelStage = {
  status: string;
  count: number;
  drop_pct: number;
};

type SourceBreakdown = {
  source: string;
  count: number;
};

type TimeInStage = {
  status: string;
  avg_days: number;
};

type DailyVolume = {
  date: string;
  count: number;
};

type AnalyticsResult = {
  funnel: FunnelStage[];
  sources: SourceBreakdown[];
  time_in_stage: TimeInStage[];
  daily_volume: DailyVolume[];
  total: number;
  placed: number;
  rejected: number;
  withdrawn: number;
  avg_time_to_place_days: number | null;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [statusCounts, sources, timeInStage, dailyVolume] = await Promise.all([
      query<{ status: string; count: string }>(
        `SELECT status, COUNT(*)::text AS count
         FROM applications
         WHERE requirement_id = $1
         GROUP BY status`,
        [id]
      ),

      query<{ source: string; count: string }>(
        `SELECT COALESCE(c.source, 'unknown') AS source, COUNT(*)::text AS count
         FROM applications a
         JOIN candidates c ON c.id = a.candidate_id
         WHERE a.requirement_id = $1
         GROUP BY c.source
         ORDER BY count DESC`,
        [id]
      ),

      // Approximate time in stage from activity log if available, else skip
      query<{ status: string; avg_days: string }>(
        `SELECT
           to_status AS status,
           ROUND(AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (PARTITION BY application_id ORDER BY created_at))) / 86400)::numeric, 1)::text AS avg_days
         FROM application_activity_log
         WHERE application_id IN (SELECT id FROM applications WHERE requirement_id = $1)
           AND activity_type = 'status_change'
           AND to_status IS NOT NULL
         GROUP BY to_status`,
        [id]
      ).catch(() => []),

      query<{ date: string; count: string }>(
        `SELECT DATE(applied_at)::text AS date, COUNT(*)::text AS count
         FROM applications
         WHERE requirement_id = $1
           AND applied_at > NOW() - INTERVAL '60 days'
         GROUP BY DATE(applied_at)
         ORDER BY date`,
        [id]
      ),
    ]);

    const statusMap = new Map(statusCounts.map((r) => [r.status, parseInt(r.count)]));
    const total = [...statusMap.values()].reduce((a, b) => a + b, 0);

    const funnel: FunnelStage[] = STATUS_ORDER.map((status, i) => {
      const count = statusMap.get(status) || 0;
      const prevCount = i > 0 ? (statusMap.get(STATUS_ORDER[i - 1]) || 0) : total;
      const drop_pct = prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 100) : 0;
      return { status, count, drop_pct };
    });

    const timeMap = new Map(timeInStage.map((r) => [r.status, parseFloat(r.avg_days)]));

    return NextResponse.json<ApiResponse<AnalyticsResult>>({
      success: true,
      data: {
        funnel,
        sources: sources.map((s) => ({ source: s.source, count: parseInt(s.count) })),
        time_in_stage: STATUS_ORDER.map((status) => ({
          status,
          avg_days: timeMap.get(status) ?? 0,
        })),
        daily_volume: dailyVolume.map((d) => ({ date: d.date, count: parseInt(d.count) })),
        total,
        placed: statusMap.get("placed") || 0,
        rejected: statusMap.get("rejected") || 0,
        withdrawn: statusMap.get("withdrawn") || 0,
        avg_time_to_place_days: null,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json<ApiResponse<null>>({ success: false, error: "Failed to load analytics" }, { status: 500 });
  }
}
