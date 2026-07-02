export type Tone = 'friendly' | 'firm' | 'urgent' | 'formal' | 'slack_casual';

export type Audience =
  | 'all_contributors'
  | 'reviewers_only'
  | 'qma_only'
  | 'invited_contributors'
  | 'new_contributors'
  | 'throttled_contributors'
  | 'specific_users';

export type CommsTemplateCategory =
  | 'urgent_alert'
  | 'webinar_alignment'
  | 'war_room'
  | 'throttle_quality'
  | 'reviewer_qma_allocation'
  | 'onboarding'
  | 'access_cursor_setup'
  | 'quality_feedback_escalation'
  | 'daily_thread_announcement'
  | 'custom';

export interface TemplateVariable {
  key: string;
  label: string;
  required: boolean;
  defaultValue?: string;
  placeholder?: string;
}

export interface CommsTemplate {
  id: string;
  category: CommsTemplateCategory;
  name: string;
  description: string;
  defaultTone: Tone;
  supportedTones: Tone[];
  audience: Audience[];
  variables: TemplateVariable[];
  body: string;
}

export const CATEGORY_LABELS: Record<CommsTemplateCategory, string> = {
  urgent_alert: 'Urgent Alert',
  webinar_alignment: 'Webinar / Alignment',
  war_room: 'War Room',
  throttle_quality: 'Throttle / Quality',
  reviewer_qma_allocation: 'Reviewer / QMA',
  onboarding: 'Onboarding',
  access_cursor_setup: 'Access / Cursor',
  quality_feedback_escalation: 'Quality Feedback',
  daily_thread_announcement: 'Daily Thread Announcement',
  custom: 'Custom Message',
};

export const TONE_LABELS: Record<Tone, string> = {
  friendly: 'Friendly',
  firm: 'Firm',
  urgent: 'Urgent',
  formal: 'Formal',
  slack_casual: 'Slack Casual',
};

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all_contributors: 'All Contributors',
  reviewers_only: 'Reviewers Only',
  qma_only: 'QMA Only',
  invited_contributors: 'Invited Contributors',
  new_contributors: 'New Contributors',
  throttled_contributors: 'Throttled Contributors',
  specific_users: 'Specific Users',
};
