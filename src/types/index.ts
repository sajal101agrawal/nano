export interface User {
  id: string;
  email: string;
  name: string;
  role: "admin" | "recruiter" | "viewer";
  password_hash?: string;
  totp_secret?: string;
  totp_enabled: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Candidate {
  id: string;
  primary_email?: string;
  primary_phone?: string;
  full_name?: string;
  location?: string;
  headline?: string;
  source: string;
  status: "active" | "inactive" | "deleted";
  availability_status: "available" | "unavailable" | "unknown";
  open_to_contract?: boolean;
  open_to_fulltime?: boolean;
  notice_period_days?: number;
  expected_rate?: string;
  expected_rate_currency?: string;
  work_mode?: string;
  current_title?: string;
  current_company?: string;
  total_experience_years?: number;
  last_active_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CandidateProfile {
  id: string;
  candidate_id: string;
  raw_cv_url?: string;
  raw_cv_filename?: string;
  raw_cv_size_bytes?: number;
  parsed_json?: ParsedCV;
  summary?: string;
  total_experience_years?: number;
  current_title?: string;
  current_company?: string;
  expected_rate?: string;
  currency?: string;
  notice_period_days?: number;
  open_to_contract?: boolean;
  open_to_fulltime?: boolean;
  work_mode?: string;
  parse_status: "pending" | "processing" | "completed" | "failed" | "review_required";
  parse_error?: string;
  version: number;
  is_current: boolean;
  created_at: string;
}

export interface ParsedCV {
  full_name?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  location?: string;
  current_title?: string;
  current_company?: string;
  total_experience_years?: number;
  headline?: string;
  summary?: string;
  domain?: string;
  seniority?: "intern" | "junior" | "mid" | "senior" | "lead" | "principal" | "executive";
  roles: Role[];
  education: Education[];
  skills: Skill[];
  projects?: Project[];
  certifications?: Certification[];
  languages?: SpokenLanguage[];
  awards?: Award[];
  publications?: Publication[];
  volunteer?: VolunteerWork[];
  raw_text_confidence?: number;
}

export interface Role {
  title: string;
  company: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  is_current?: boolean;
  duration_months?: number;
  summary?: string;
  achievements?: string[];
}

export interface Project {
  name: string;
  description?: string;
  technologies?: string[];
  url?: string;
  start_date?: string;
  end_date?: string;
  highlights?: string[];
  is_open_source?: boolean;
}

export interface Education {
  institution: string;
  degree?: string;
  field?: string;
  graduation_year?: string;
  grade?: string;
}

export interface Skill {
  skill: string;
  years?: number;
  proficiency?: "beginner" | "intermediate" | "advanced" | "expert";
  category?: "technical" | "framework" | "tool" | "language" | "soft" | "domain";
}

export interface Certification {
  name: string;
  issuer?: string;
  year?: string;
}

export interface SpokenLanguage {
  language: string;
  proficiency?: "native" | "fluent" | "professional" | "conversational" | "basic";
}

export interface Award {
  title: string;
  issuer?: string;
  year?: string;
  description?: string;
}

export interface Publication {
  title: string;
  publisher?: string;
  year?: string;
  url?: string;
  description?: string;
}

export interface VolunteerWork {
  role: string;
  organization: string;
  start_date?: string;
  end_date?: string;
  description?: string;
}

export interface CandidateSkill {
  id: string;
  candidate_id: string;
  skill: string;
  skill_normalized: string;
  years?: number;
  proficiency?: string;
  created_at: string;
}

export interface Requirement {
  id: string;
  client_id?: string;
  title: string;
  jd_raw: string;
  parsed_requirements_json?: ParsedRequirements;
  required_skills?: string[];
  min_experience?: number;
  location?: string;
  work_mode?: "remote" | "onsite" | "hybrid" | "flexible";
  engagement_type: "contract" | "fulltime" | "both";
  budget_min?: number;
  budget_max?: number;
  budget_currency?: string;
  budget_period?: "hourly" | "daily" | "monthly" | "annual";
  status: "open" | "on_hold" | "filled" | "closed";
  public_slug: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedRequirements {
  required_skills: string[];
  nice_to_have_skills: string[];
  min_experience_years?: number;
  max_experience_years?: number;
  engagement_type?: string;
  location?: string;
  work_mode?: string;
  budget_range?: string;
  key_responsibilities?: string[];
  qualifications?: string[];
}

export interface RequirementQuestion {
  id: string;
  requirement_id: string;
  question_text: string;
  question_type: "text" | "select" | "boolean" | "multiselect";
  options?: { value: string; label: string }[];
  required: boolean;
  sort_order: number;
  created_at: string;
}

export interface Application {
  id: string;
  requirement_id: string;
  candidate_id: string;
  profile_id?: string;
  status: ApplicationStatus;
  pipeline_stage_id?: string;
  match_score?: number;
  vector_score?: number;
  rule_score?: number;
  match_rationale?: string;
  rating?: number;
  seen_at?: string;
  applied_at: string;
  updated_at: string;
}

export interface ApplicationActivityLog {
  id: string;
  application_id: string;
  requirement_id: string;
  candidate_id: string;
  actor_id?: string;
  actor_name?: string;
  action: string;
  old_value?: string;
  new_value?: string;
  note?: string;
  created_at: string;
}

export interface CandidateNote {
  id: string;
  candidate_id: string;
  application_id?: string;
  requirement_id?: string;
  author_id?: string;
  author_name?: string;
  body: string;
  visibility: "private" | "team";
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface CandidateTag {
  id: string;
  candidate_id: string;
  tag: string;
  color: string;
  created_by?: string;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  requirement_id?: string;
  name: string;
  color: string;
  sort_order: number;
  maps_to_status?: string;
  is_default: boolean;
  created_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  requirement_id: string;
  candidate_id: string;
  interview_type: "video" | "phone" | "onsite" | "technical" | "hr";
  round_number: number;
  scheduled_at?: string;
  duration_minutes: number;
  location?: string;
  status: "scheduled" | "completed" | "cancelled" | "no_show";
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  interviewers?: InterviewInterviewer[];
  scorecard?: InterviewScorecard;
}

export interface InterviewInterviewer {
  id: string;
  interview_id: string;
  user_id: string;
  user_name?: string;
  response_status: "pending" | "accepted" | "declined";
  created_at: string;
}

export interface InterviewScorecard {
  id: string;
  interview_id: string;
  interviewer_id: string;
  criteria_json?: Array<{ name: string; rating: number; comment?: string }>;
  overall_rating?: number;
  recommendation?: "strong_yes" | "yes" | "maybe" | "no" | "strong_no";
  notes?: string;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FollowUpReminder {
  id: string;
  candidate_id: string;
  application_id?: string;
  requirement_id?: string;
  created_by: string;
  assigned_to?: string;
  note?: string;
  due_at: string;
  completed_at?: string;
  created_at: string;
}

export interface TalentPool {
  id: string;
  name: string;
  description?: string;
  created_by?: string;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface SavedSearch {
  id: string;
  user_id: string;
  name: string;
  query_params_json: Record<string, unknown>;
  notify_on_new_match: boolean;
  last_checked_at?: string;
  last_match_count?: number;
  created_at: string;
  updated_at: string;
}

export type ApplicationStatus =
  | "applied"
  | "parsing"
  | "parsed"
  | "parse_failed"
  | "shortlisted"
  | "contacted"
  | "in_discussion"
  | "offered"
  | "placed"
  | "rejected"
  | "withdrawn";

export interface AvailabilityEvent {
  id: string;
  candidate_id: string;
  status: "available" | "unavailable" | "unknown";
  source: "application" | "email_click" | "admin" | "system" | "expiry";
  token?: string;
  token_used: boolean;
  requirement_id?: string;
  requested_at: string;
  responded_at?: string;
  expires_at?: string;
  notes?: string;
}

export interface Match {
  id: string;
  requirement_id: string;
  candidate_id: string;
  score?: number;
  vector_score?: number;
  rule_score?: number;
  rationale?: string;
  generated_at: string;
}

export interface Prospect {
  id: string;
  provider: string;
  provider_profile_id?: string;
  full_name?: string;
  headline?: string;
  current_company?: string;
  location?: string;
  public_profile_url?: string;
  summary?: string;
  enrichment_json?: Record<string, unknown>;
  email?: string;
  email_status?: "found" | "not_found" | "unverifiable" | "bounced";
  provenance_json?: Record<string, unknown>;
  sourced_for_requirement_id?: string;
  converted_to_candidate_id?: string;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  website?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Recruiter {
  id: string;
  client_id: string;
  contact_name: string;
  email: string;
  phone?: string;
  role?: string;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  template_type: TemplateType;
  subject: string;
  body: string;
  variables?: string[];
  is_system: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type TemplateType =
  | "candidate_outreach"
  | "shortlist_intro"
  | "availability_check"
  | "recruiter_profile_share"
  | "otp"
  | "confirmation"
  | "general"
  | "staffing_requirement_share"
  | "staffing_general_outreach"
  | "staffing_resource_request";

export interface OutreachMessage {
  id: string;
  target_type: "candidate" | "prospect" | "recruiter" | "staffing_user";
  target_id: string;
  requirement_id?: string;
  template_id?: string;
  sent_by?: string;
  subject: string;
  body: string;
  email_to: string;
  stream: "transactional" | "availability" | "outreach";
  status: MessageStatus;
  esp_message_id?: string;
  thread_id?: string;
  sent_at?: string;
  created_at: string;
}

export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed"
  | "replied";

export interface Notification {
  id: string;
  user_id?: string;
  type: NotificationType;
  title: string;
  body?: string;
  entity_type?: string;
  entity_id?: string;
  read: boolean;
  created_at: string;
}

export type NotificationType =
  | "new_application"
  | "parse_failed"
  | "availability_changed"
  | "email_reply"
  | "system";

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  role: string;
  totpVerified: boolean;
}

export interface CandidateSession {
  candidateId?: string;
  identifier: string;
  identifierType: "email" | "phone";
  verified: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ─── Staffing Portal ──────────────────────────────────────────────────────────

export interface StaffingCompany {
  id: string;
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  notes?: string;
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffingUser {
  id: string;
  company_id: string;
  email: string;
  name: string;
  designation?: string;
  status: "active" | "suspended";
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

export interface StaffingResource {
  id: string;
  company_id: string;
  added_by?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  current_title?: string;
  current_company?: string;
  total_experience_years?: number;
  location?: string;
  work_mode?: string;
  skills?: string[];
  availability_status: "available" | "unavailable" | "unknown";
  expected_rate?: string;
  rate_currency?: string;
  notice_period_days?: number;
  notes?: string;
  status: "active" | "inactive" | "deleted";
  created_at: string;
  updated_at: string;
}

export interface StaffingResourceProfile {
  id: string;
  resource_id: string;
  raw_cv_url?: string;
  raw_cv_filename?: string;
  raw_cv_size_bytes?: number;
  parsed_json?: ParsedCV;
  summary?: string;
  total_experience_years?: number;
  current_title?: string;
  current_company?: string;
  parse_status: "pending" | "processing" | "completed" | "failed" | "review_required";
  parse_error?: string;
  version: number;
  is_current: boolean;
  created_at: string;
}

export interface StaffingSession {
  userId: string;
  companyId: string;
  email: string;
  name: string;
  designation?: string;
}
