import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import type {
  ApiResponse,
  Candidate,
  CandidateProfile,
  CandidateSkill,
  Application,
  AvailabilityEvent,
  OutreachMessage,
} from "@/types";

type ApplicationWithReq = Application & {
  requirement_title: string;
  client_name: string | null;
};

export interface CandidateDetailResponse {
  candidate: Candidate;
  profile: CandidateProfile | null;
  skills: CandidateSkill[];
  applications: ApplicationWithReq[];
  availabilityEvents: AvailabilityEvent[];
  outreachMessages: OutreachMessage[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await requireAdminSession();

    const candidate = await queryOne<Candidate>(
      `SELECT * FROM candidates WHERE id = $1 AND status != 'deleted'`,
      [id]
    );

    if (!candidate) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const [profile, skills, applications, availabilityEvents, outreachMessages] =
      await Promise.all([
        queryOne<CandidateProfile>(
          `SELECT * FROM candidate_profiles WHERE candidate_id = $1 AND is_current = TRUE`,
          [id]
        ),
        query<CandidateSkill>(
          `SELECT * FROM candidate_skills WHERE candidate_id = $1 ORDER BY years DESC NULLS LAST`,
          [id]
        ),
        query<ApplicationWithReq>(
          `SELECT a.*,
                  r.title AS requirement_title,
                  c.company_name AS client_name
           FROM applications a
           JOIN requirements r ON r.id = a.requirement_id
           LEFT JOIN clients c ON c.id = r.client_id
           WHERE a.candidate_id = $1
           ORDER BY a.applied_at DESC`,
          [id]
        ),
        query<AvailabilityEvent>(
          `SELECT * FROM availability_events
           WHERE candidate_id = $1
           ORDER BY requested_at DESC
           LIMIT 10`,
          [id]
        ),
        query<OutreachMessage>(
          `SELECT * FROM outreach_messages
           WHERE target_type = 'candidate' AND target_id = $1
           ORDER BY created_at DESC
           LIMIT 20`,
          [id]
        ),
      ]);

    const result: CandidateDetailResponse = {
      candidate,
      profile,
      skills,
      applications,
      availabilityEvents,
      outreachMessages,
    };

    return NextResponse.json<ApiResponse<CandidateDetailResponse>>({
      success: true,
      data: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    if (message === "Unauthorized") {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
