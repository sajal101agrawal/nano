-- 002_default_templates.sql
-- Seed default email templates

INSERT INTO templates (id, name, template_type, subject, body, variables, is_system) VALUES
(
  uuid_generate_v4(),
  'Application Confirmation',
  'confirmation',
  'Your application has been received — {{requirement_title}}',
  '<p>Hi {{candidate_name}},</p>
<p>Thank you for applying for <strong>{{requirement_title}}</strong>. We have received your application and CV.</p>
<p>Our team will review your profile and reach out if there is a strong match. This usually takes 2–5 business days.</p>
<p>Best regards,<br/>{{from_name}}</p>
<p style="font-size:12px;color:#666;">You received this email because you applied through our talent platform. <a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  ARRAY['candidate_name', 'requirement_title', 'from_name', 'unsubscribe_url'],
  TRUE
),
(
  uuid_generate_v4(),
  'Availability Check',
  'availability_check',
  'Quick check — are you still open to new roles?',
  '<p>Hi {{candidate_name}},</p>
<p>We have an active requirement that looks like a strong match for your profile. Before we put you forward, we wanted to quickly confirm your availability.</p>
<p>Please click one of the options below — it takes just one click:</p>
<table>
<tr>
  <td><a href="{{available_url}}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Yes, I am available</a></td>
  <td style="width:16px;"></td>
  <td><a href="{{unavailable_url}}" style="background:#64748b;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">No, not available right now</a></td>
</tr>
</table>
<p>This link expires in {{expiry_days}} days.</p>
<p>Best regards,<br/>{{from_name}}</p>
<p style="font-size:12px;color:#666;"><a href="{{unsubscribe_url}}">Unsubscribe</a> from availability emails.</p>',
  ARRAY['candidate_name', 'available_url', 'unavailable_url', 'expiry_days', 'from_name', 'unsubscribe_url'],
  TRUE
),
(
  uuid_generate_v4(),
  'Candidate Outreach',
  'candidate_outreach',
  'A role that matches your profile — {{requirement_title}}',
  '<p>Hi {{candidate_name}},</p>
<p>I am reaching out because I think you could be a strong fit for a {{engagement_type}} role we are currently working on.</p>
<p><strong>Role:</strong> {{requirement_title}}<br/>
<strong>Location/Mode:</strong> {{location}}<br/>
{{#if budget}}<strong>Rate:</strong> {{budget}}<br/>{{/if}}
</p>
<p>{{custom_message}}</p>
<p>Would you be open to a quick conversation? Please reply to this email or let me know a time that works for you.</p>
<p>Best regards,<br/>{{from_name}}<br/>{{from_company}}</p>
<p style="font-size:12px;color:#666;"><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  ARRAY['candidate_name', 'requirement_title', 'engagement_type', 'location', 'budget', 'custom_message', 'from_name', 'from_company', 'unsubscribe_url'],
  TRUE
),
(
  uuid_generate_v4(),
  'Recruiter Profile Share',
  'recruiter_profile_share',
  'Candidate profile for {{requirement_title}} — {{candidate_name}}',
  '<p>Hi {{recruiter_name}},</p>
<p>Please find below a candidate profile for the <strong>{{requirement_title}}</strong> requirement.</p>
<hr/>
<p><strong>{{candidate_name}}</strong><br/>
{{headline}}</p>
<p><strong>Experience:</strong> {{experience_years}} years<br/>
<strong>Current:</strong> {{current_role}} at {{current_company}}<br/>
<strong>Notice Period:</strong> {{notice_period}}<br/>
<strong>Open to Contract:</strong> {{open_to_contract}}<br/>
<strong>Location:</strong> {{location}}<br/>
{{#if rate}}<strong>Expected Rate:</strong> {{rate}}<br/>{{/if}}
</p>
<p><strong>Summary:</strong><br/>{{summary}}</p>
<hr/>
<p>{{custom_notes}}</p>
<p>Best regards,<br/>{{from_name}}</p>',
  ARRAY['recruiter_name', 'requirement_title', 'candidate_name', 'headline', 'experience_years', 'current_role', 'current_company', 'notice_period', 'open_to_contract', 'location', 'rate', 'summary', 'custom_notes', 'from_name'],
  TRUE
),
(
  uuid_generate_v4(),
  'Prospect Outreach',
  'candidate_outreach',
  'Relevant opportunity — {{requirement_title}}',
  '<p>Hi {{candidate_name}},</p>
<p>I came across your profile and wanted to reach out about an opportunity that may be of interest.</p>
<p>We are currently looking for a <strong>{{requirement_title}}</strong> ({{engagement_type}}). {{custom_message}}</p>
<p>If this is of interest, I would love to connect. Please reply to this email or click below to express interest.</p>
<p>Best regards,<br/>{{from_name}}<br/>{{from_company}}</p>
<p style="font-size:12px;color:#666;">You are receiving this because your professional profile was found via {{provider}}. <a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
  ARRAY['candidate_name', 'requirement_title', 'engagement_type', 'custom_message', 'from_name', 'from_company', 'provider', 'unsubscribe_url'],
  TRUE
);
