-- 008_staffing_templates.sql
-- Extend constraints to support staffing template types and seed staffing email templates

-- Extend template_type CHECK constraint to include staffing types
ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_template_type_check;
ALTER TABLE templates ADD CONSTRAINT templates_template_type_check
  CHECK (template_type IN (
    'candidate_outreach', 'shortlist_intro', 'availability_check',
    'recruiter_profile_share', 'otp', 'confirmation', 'general',
    'staffing_requirement_share', 'staffing_general_outreach', 'staffing_resource_request'
  ));

-- Extend outreach_messages target_type CHECK constraint to include staffing_user
ALTER TABLE outreach_messages DROP CONSTRAINT IF EXISTS outreach_messages_target_type_check;
ALTER TABLE outreach_messages ADD CONSTRAINT outreach_messages_target_type_check
  CHECK (target_type IN ('candidate', 'prospect', 'recruiter', 'staffing_user'));

-- Seed staffing email templates
INSERT INTO templates (id, name, template_type, subject, body, variables, is_system) VALUES
(
  uuid_generate_v4(),
  'Staffing — Requirement Share',
  'staffing_requirement_share',
  'New requirement: {{requirement_title}} — Do you have matching resources?',
  '<p>Hi {{contact_name}},</p>
<p>We have a new requirement that we believe your team may have strong candidates for. Please find the details below:</p>
<hr/>
<p><strong>Role:</strong> {{requirement_title}}<br/>
<strong>Engagement Type:</strong> {{engagement_type}}<br/>
<strong>Location / Work Mode:</strong> {{location}}<br/>
{{#if budget}}<strong>Budget:</strong> {{budget}}<br/>{{/if}}
</p>
<p><strong>Key Requirements:</strong><br/>{{requirement_summary}}</p>
<hr/>
<p>{{custom_message}}</p>
<p>If you have suitable candidates, please share their profiles at your earliest convenience. You can reply to this email or log into our portal to submit profiles directly.</p>
<p>Best regards,<br/>{{from_name}}<br/>{{from_company}}</p>',
  ARRAY['contact_name', 'requirement_title', 'engagement_type', 'location', 'budget', 'requirement_summary', 'custom_message', 'from_name', 'from_company'],
  TRUE
),
(
  uuid_generate_v4(),
  'Staffing — General Outreach',
  'staffing_general_outreach',
  'Partnership Opportunity — {{from_company}}',
  '<p>Hi {{contact_name}},</p>
<p>I am reaching out from {{from_company}} regarding a potential staffing partnership.</p>
<p>{{custom_message}}</p>
<p>We are always looking for reliable staffing partners who can provide quality resources quickly. If you are interested in collaborating, I would love to set up a brief call.</p>
<p>Please reply to this email or reach out at a time that suits you.</p>
<p>Best regards,<br/>{{from_name}}<br/>{{from_company}}</p>',
  ARRAY['contact_name', 'custom_message', 'from_name', 'from_company'],
  TRUE
),
(
  uuid_generate_v4(),
  'Staffing — Specific Resource Request',
  'staffing_resource_request',
  'Resource request: {{skill_set}} — {{from_company}}',
  '<p>Hi {{contact_name}},</p>
<p>We are urgently looking for resources with the following profile:</p>
<hr/>
<p><strong>Skills:</strong> {{skill_set}}<br/>
<strong>Experience:</strong> {{experience_required}}<br/>
<strong>Engagement:</strong> {{engagement_type}}<br/>
<strong>Start Date:</strong> {{start_date}}<br/>
{{#if budget}}<strong>Budget:</strong> {{budget}}<br/>{{/if}}
</p>
<p>{{custom_message}}</p>
<hr/>
<p>Please share matching profiles as soon as possible. We are looking to move quickly on this one.</p>
<p>Best regards,<br/>{{from_name}}<br/>{{from_company}}</p>',
  ARRAY['contact_name', 'skill_set', 'experience_required', 'engagement_type', 'start_date', 'budget', 'custom_message', 'from_name', 'from_company'],
  TRUE
);
