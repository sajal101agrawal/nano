import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    poolStats,
    availabilityBreakdown,
    applicationFunnel,
    requirementsByStatus,
    emailStats,
    weeklyGrowth,
    topSkills,
  ] = await Promise.all([
    query<{ total: string; active: string; last30d: string }>(
      `SELECT COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS last30d
       FROM candidates`
    ),
    query<{ availability_status: string; count: string }>(
      "SELECT availability_status, COUNT(*) AS count FROM candidates WHERE status = 'active' GROUP BY availability_status"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM applications GROUP BY status ORDER BY count DESC"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM requirements GROUP BY status"
    ),
    query<{ status: string; count: string }>(
      "SELECT status, COUNT(*) AS count FROM outreach_messages GROUP BY status"
    ),
    query<{ week: string; count: string }>(
      `SELECT DATE_TRUNC('week', created_at) AS week, COUNT(*) AS count
       FROM candidates WHERE created_at > NOW() - INTERVAL '12 weeks'
       GROUP BY week ORDER BY week`
    ),
    query<{ skill: string; count: string }>(
      "SELECT skill, COUNT(*) AS count FROM candidate_skills GROUP BY skill ORDER BY count DESC LIMIT 15"
    ),
  ]);

  return NextResponse.json({
    poolStats: poolStats[0],
    availabilityBreakdown,
    applicationFunnel,
    requirementsByStatus,
    emailStats,
    weeklyGrowth,
    topSkills,
  });
}
