import rawTemplates from '../../data/comms-templates.json';
import { readDataJSON, writeDataJSON } from '../data-store';
import { getCurrentProjectId, isLegacyProjectId } from '../project-context';
import { Audience, CommsTemplate, CommsTemplateCategory, TemplateVariable, Tone } from './types';

const FILE = 'data/comms-templates.json';

const CATEGORIES: CommsTemplateCategory[] = [
  'urgent_alert',
  'webinar_alignment',
  'war_room',
  'throttle_quality',
  'reviewer_qma_allocation',
  'onboarding',
  'access_cursor_setup',
  'quality_feedback_escalation',
  'daily_thread_announcement',
  'custom',
];

const TONES: Tone[] = ['friendly', 'firm', 'urgent', 'formal', 'slack_casual'];

const AUDIENCES: Audience[] = [
  'all_contributors',
  'reviewers_only',
  'qma_only',
  'invited_contributors',
  'new_contributors',
  'throttled_contributors',
  'specific_users',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function isCategory(value: string): value is CommsTemplateCategory {
  return CATEGORIES.includes(value as CommsTemplateCategory);
}

function isTone(value: string): value is Tone {
  return TONES.includes(value as Tone);
}

function isAudience(value: string): value is Audience {
  return AUDIENCES.includes(value as Audience);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeVariable(input: unknown, index: number): TemplateVariable {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const key = slug(text(raw.key));
  const label = text(raw.label) || key.replace(/_/g, ' ') || `Variable ${index + 1}`;
  if (!key) throw new Error(`Variable ${index + 1} needs a key.`);

  return {
    key,
    label,
    required: raw.required !== false,
    ...(text(raw.defaultValue) ? { defaultValue: text(raw.defaultValue) } : {}),
    ...(text(raw.placeholder) ? { placeholder: text(raw.placeholder) } : {}),
  };
}

export function normalizeCommsTemplate(input: unknown): CommsTemplate {
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const id = slug(text(raw.id) || text(raw.name));
  const category = text(raw.category);
  const defaultTone = text(raw.defaultTone);
  const body = text(raw.body);

  if (!id) throw new Error('Template ID is required.');
  if (!isCategory(category)) throw new Error('Template category is invalid.');
  if (!text(raw.name)) throw new Error('Template name is required.');
  if (!body) throw new Error('Template body is required.');
  if (!isTone(defaultTone)) throw new Error('Default tone is invalid.');

  const supportedTones = unique(
    (Array.isArray(raw.supportedTones) ? raw.supportedTones : [defaultTone])
      .map(text)
      .filter(isTone)
  );

  const audience = unique(
    (Array.isArray(raw.audience) ? raw.audience : ['all_contributors'])
      .map(text)
      .filter(isAudience)
  );

  return {
    id,
    category,
    name: text(raw.name).slice(0, 120),
    description: text(raw.description).slice(0, 300),
    defaultTone,
    supportedTones: supportedTones.length > 0 ? supportedTones : [defaultTone],
    audience: audience.length > 0 ? audience : ['all_contributors'],
    variables: (Array.isArray(raw.variables) ? raw.variables : [])
      .map(normalizeVariable)
      .slice(0, 30),
    body: body.slice(0, 12000),
  };
}

export function normalizeCommsTemplates(input: unknown): CommsTemplate[] {
  if (!Array.isArray(input)) throw new Error('Comms templates must be a JSON array.');
  const templates = input.map(normalizeCommsTemplate);
  const ids = new Set<string>();
  for (const template of templates) {
    if (ids.has(template.id)) throw new Error(`Duplicate template ID: ${template.id}`);
    ids.add(template.id);
  }
  return templates.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadProjectCommsTemplates(): Promise<CommsTemplate[]> {
  try {
    return normalizeCommsTemplates(await readDataJSON<unknown>(FILE));
  } catch (err) {
    if (!isLegacyProjectId(getCurrentProjectId())) return [];
    return normalizeCommsTemplates(rawTemplates);
  }
}

export async function saveProjectCommsTemplates(templates: CommsTemplate[], message = 'update comms templates'): Promise<void> {
  await writeDataJSON(FILE, normalizeCommsTemplates(templates), message);
}

export async function createProjectCommsTemplate(input: unknown): Promise<CommsTemplate> {
  const templates = await loadProjectCommsTemplates();
  const template = normalizeCommsTemplate(input);
  if (templates.some((item) => item.id === template.id)) {
    throw new Error(`Template already exists: ${template.id}`);
  }
  await saveProjectCommsTemplates([...templates, template], `create comms template ${template.id}`);
  return template;
}

export async function updateProjectCommsTemplate(id: string, input: unknown): Promise<CommsTemplate> {
  const templates = await loadProjectCommsTemplates();
  const index = templates.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Template not found.');

  const template = normalizeCommsTemplate({ ...(input as Record<string, unknown>), id });
  templates[index] = template;
  await saveProjectCommsTemplates(templates, `update comms template ${id}`);
  return template;
}

export async function deleteProjectCommsTemplate(id: string): Promise<void> {
  const templates = await loadProjectCommsTemplates();
  const next = templates.filter((item) => item.id !== id);
  if (next.length === templates.length) throw new Error('Template not found.');
  await saveProjectCommsTemplates(next, `delete comms template ${id}`);
}
