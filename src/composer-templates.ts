import { readDataJSON } from './data-store';
import { COMPOSER_CHANNELS, COMPOSER_OBJECTIVES, COMPOSER_TONES, ComposerChannel, ComposerObjective, ComposerTone } from './message-composer';

const FILE = 'data/composer-templates.json';

export interface ComposerTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  audience: string;
  channel: ComposerChannel;
  tone: ComposerTone;
  objective: ComposerObjective;
  extraContext: string;
  includeWarRoomLink: boolean;
  includeSignature: boolean;
}

const DEFAULT_TEMPLATES: ComposerTemplate[] = [
  {
    id: 'cursor_access_step_zero',
    name: 'Cursor Access Step 0',
    description: 'Reminder for contributors who passed courses and need Cursor access.',
    prompt: 'Tell contributors who passed the courses and are now EQ or see the project as ineligible to come to the War Room to request Cursor access. Mention this is step 0 of the project guideline.',
    audience: 'Stargazer contributors',
    channel: 'community',
    tone: 'professional',
    objective: 'ask_for_action',
    extraContext: 'Keep it concise and operational.',
    includeWarRoomLink: true,
    includeSignature: false,
  },
  {
    id: 'war_room_open',
    name: 'War Room Open',
    description: 'Short message that live support is currently available.',
    prompt: 'Let contributors know the War Room is open now for live support.',
    audience: 'Stargazer contributors',
    channel: 'community',
    tone: 'friendly',
    objective: 'inform',
    extraContext: 'Tell them to join the Stargazer - Team breakout room once inside.',
    includeWarRoomLink: true,
    includeSignature: false,
  },
  {
    id: 'war_room_weekend_closed',
    name: 'Weekend Closed',
    description: 'Weekend reply when live support is not available.',
    prompt: 'Explain that the War Room is closed on Saturdays and Sundays in Argentina and ask contributors to come back on Monday between 11:15 AM and 7:00 PM ARG.',
    audience: 'Stargazer contributors',
    channel: 'community',
    tone: 'warm_supportive',
    objective: 'inform',
    extraContext: 'Do not include the War Room link.',
    includeWarRoomLink: false,
    includeSignature: false,
  },
  {
    id: 'guideline_clarification',
    name: 'Guideline Clarification',
    description: 'Ask for a human check when policy details are unclear.',
    prompt: 'Write a careful support reply for a contributor asking about a guideline detail that is not fully clear.',
    audience: 'Stargazer contributor',
    channel: 'dm',
    tone: 'warm_supportive',
    objective: 'de_escalate',
    extraContext: 'Do not invent policy. Ask them to share the exact screen or issue and say a human will review if needed.',
    includeWarRoomLink: false,
    includeSignature: false,
  },
  {
    id: 'webinar_reminder',
    name: 'Session Reminder',
    description: 'Reminder for an upcoming webinar or onboarding session.',
    prompt: 'Remind contributors about an upcoming Stargazer session and ask them to attend if it applies to them.',
    audience: 'Stargazer contributors',
    channel: 'reminder',
    tone: 'professional',
    objective: 'remind',
    extraContext: 'Add the session time and link in the context before generating.',
    includeWarRoomLink: false,
    includeSignature: false,
  },
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(value as T[number]) ? value as T[number] : fallback;
}

function safeId(value: unknown, fallback: string): string {
  const id = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return id || fallback;
}

function normalizeTemplate(raw: unknown, index: number): ComposerTemplate | null {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const name = text(record.name);
  const prompt = text(record.prompt);
  if (!name || !prompt) return null;

  return {
    id: safeId(record.id, `template_${index + 1}`),
    name: name.slice(0, 120),
    description: text(record.description).slice(0, 240),
    prompt: prompt.slice(0, 3000),
    audience: text(record.audience) || 'Stargazer contributors',
    channel: oneOf(record.channel, COMPOSER_CHANNELS, 'community'),
    tone: oneOf(record.tone, COMPOSER_TONES, 'professional'),
    objective: oneOf(record.objective, COMPOSER_OBJECTIVES, 'inform'),
    extraContext: text(record.extraContext).slice(0, 3000),
    includeWarRoomLink: record.includeWarRoomLink === true,
    includeSignature: record.includeSignature === true,
  };
}

export async function loadComposerTemplates(): Promise<ComposerTemplate[]> {
  try {
    const raw = await readDataJSON<unknown[]>(FILE);
    if (!Array.isArray(raw)) return DEFAULT_TEMPLATES;
    const templates = raw
      .map((item, index) => normalizeTemplate(item, index))
      .filter((item): item is ComposerTemplate => Boolean(item));
    return templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  } catch {
    return DEFAULT_TEMPLATES;
  }
}
