import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

interface ApolloPersonResult {
  id: string;
  first_name: string;
  last_name: string;
  title: string;
  organization_name: string;
  city: string;
  country: string;
  linkedin_url: string;
  summary?: string;
}

async function searchApollo(params: {
  skills: string;
  title: string;
  location: string;
  seniority: string;
}): Promise<ApolloPersonResult[]> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey || apiKey === "placeholder-replace-with-real-key") {
    return [];
  }

  const body: Record<string, unknown> = {
    api_key: apiKey,
    q_keywords: [params.skills, params.title].filter(Boolean).join(" "),
    person_titles: params.title ? [params.title] : undefined,
    person_locations: params.location ? [params.location] : undefined,
    person_seniorities: params.seniority ? [params.seniority] : undefined,
    per_page: 25,
  };

  const res = await fetch("https://api.apollo.io/v1/mixed_people/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];

  const data = (await res.json()) as { people?: ApolloPersonResult[] };
  return data.people || [];
}

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { skills, title, location, seniority } = body;

    const apolloResults = await searchApollo({ skills, title, location, seniority });

    const prospects = [];
    for (const person of apolloResults) {
      const fullName = [person.first_name, person.last_name].filter(Boolean).join(" ");
      const locationStr = [person.city, person.country].filter(Boolean).join(", ");

      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM prospects WHERE provider = 'apollo' AND provider_profile_id = $1",
        [person.id]
      );

      let prospectId: string;
      if (existing) {
        prospectId = existing.id;
        await query(
          `UPDATE prospects SET full_name=$1, headline=$2, current_company=$3, location=$4,
           public_profile_url=$5, updated_at=NOW() WHERE id=$6`,
          [fullName, person.title, person.organization_name, locationStr, person.linkedin_url, prospectId]
        );
      } else {
        prospectId = uuidv4();
        await query(
          `INSERT INTO prospects (id, provider, provider_profile_id, full_name, headline, current_company, location, public_profile_url, provenance_json)
           VALUES ($1, 'apollo', $2, $3, $4, $5, $6, $7, $8)`,
          [
            prospectId,
            person.id,
            fullName,
            person.title,
            person.organization_name,
            locationStr,
            person.linkedin_url,
            JSON.stringify({ source: "apollo_search", searched_at: new Date().toISOString() }),
          ]
        );
      }

      prospects.push({
        id: prospectId,
        full_name: fullName,
        headline: person.title,
        current_company: person.organization_name,
        location: locationStr,
        public_profile_url: person.linkedin_url,
        provider: "apollo",
        email_status: null,
        email: null,
      });
    }

    return NextResponse.json({ prospects });
  } catch (err) {
    console.error("[prospects/search]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
