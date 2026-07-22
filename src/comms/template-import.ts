import { normalizeCommsTemplate } from './template-store';
import { CommsTemplate } from './types';

export interface CommsImportError {
  index: number;
  path: string;
  message: string;
}

export interface CommsImportValidation {
  ok: boolean;
  templates: CommsTemplate[];
  errors: CommsImportError[];
}

const CATEGORIES = new Set([
  'urgent_alert', 'webinar_alignment', 'war_room', 'throttle_quality',
  'reviewer_qma_allocation', 'onboarding', 'access_cursor_setup',
  'quality_feedback_escalation', 'daily_thread_announcement', 'custom',
]);
const TONES = new Set(['friendly', 'firm', 'urgent', 'formal', 'slack_casual']);
const AUDIENCES = new Set([
  'all_contributors', 'reviewers_only', 'qma_only', 'invited_contributors',
  'new_contributors', 'throttled_contributors', 'specific_users',
]);

export const COMMS_JSON_EXAMPLE: CommsTemplate[] = [{
  id: 'aurora_daily_check_in',
  category: 'daily_thread_announcement',
  name: 'Aurora Daily Check-In',
  description: 'Fictitious daily check-in for the Aurora demo project.',
  defaultTone: 'friendly',
  supportedTones: ['friendly', 'slack_casual'],
  audience: ['all_contributors'],
  variables: [{
    key: 'dailyThreadLink',
    label: 'Daily thread link',
    required: true,
    placeholder: 'https://example.com/aurora-daily-thread',
  }],
  body: 'Hi team, the Aurora daily check-in is ready.\n\nPlease share your update here:\n{{dailyThreadLink}}',
}];

function valueText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function issue(index: number, path: string, message: string): CommsImportError {
  return { index, path, message };
}

function itemsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).templates)) {
    return (payload as { templates: unknown[] }).templates;
  }
  throw new Error('JSON must be an array of comms templates or an object with a "templates" array.');
}

function validateTemplate(input: unknown, index: number): { template?: CommsTemplate; errors: CommsImportError[] } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: [issue(index, '$', 'Each comms template must be an object.')] };
  }
  const raw = input as Record<string, unknown>;
  const errors: CommsImportError[] = [];
  for (const field of ['id', 'category', 'name', 'defaultTone', 'body']) {
    if (!valueText(raw[field])) errors.push(issue(index, field, `${field} is required.`));
  }
  if (valueText(raw.category) && !CATEGORIES.has(valueText(raw.category))) {
    errors.push(issue(index, 'category', `Unsupported category: ${valueText(raw.category)}`));
  }
  if (valueText(raw.defaultTone) && !TONES.has(valueText(raw.defaultTone))) {
    errors.push(issue(index, 'defaultTone', `Unsupported tone: ${valueText(raw.defaultTone)}`));
  }

  for (const [field, allowed] of [['supportedTones', TONES], ['audience', AUDIENCES]] as const) {
    if (raw[field] !== undefined && !Array.isArray(raw[field])) {
      errors.push(issue(index, field, `${field} must be an array.`));
    } else if (Array.isArray(raw[field])) {
      raw[field].forEach((value, valueIndex) => {
        if (!allowed.has(valueText(value))) errors.push(issue(index, `${field}.${valueIndex}`, `Unsupported value: ${String(value)}`));
      });
    }
  }

  const declaredVariables = new Set<string>();
  if (raw.variables !== undefined && !Array.isArray(raw.variables)) {
    errors.push(issue(index, 'variables', 'variables must be an array.'));
  } else if (Array.isArray(raw.variables)) {
    raw.variables.forEach((value, variableIndex) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(issue(index, `variables.${variableIndex}`, 'Each variable must be an object.'));
        return;
      }
      const variable = value as Record<string, unknown>;
      const key = valueText(variable.key);
      if (!key) errors.push(issue(index, `variables.${variableIndex}.key`, 'Variable key is required.'));
      else if (!/^[a-zA-Z0-9_]+$/.test(key)) errors.push(issue(index, `variables.${variableIndex}.key`, 'Use only letters, numbers, and underscores.'));
      else if (declaredVariables.has(key)) errors.push(issue(index, `variables.${variableIndex}.key`, `Duplicate variable key: ${key}`));
      else declaredVariables.add(key);
      if (variable.required !== undefined && typeof variable.required !== 'boolean') {
        errors.push(issue(index, `variables.${variableIndex}.required`, 'required must be true or false.'));
      }
    });
  }

  const placeholders = Array.from(valueText(raw.body).matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)).map((match) => match[1]);
  for (const placeholder of placeholders) {
    if (!/^[a-zA-Z0-9_]+$/.test(placeholder)) {
      errors.push(issue(index, 'body', `Invalid placeholder: {{${placeholder}}}`));
    } else if (!declaredVariables.has(placeholder)) {
      errors.push(issue(index, 'body', `Placeholder {{${placeholder}}} needs a matching variable definition.`));
    }
  }

  if (errors.length) return { errors };
  try {
    return { template: normalizeCommsTemplate(raw), errors: [] };
  } catch (err) {
    return { errors: [issue(index, '$', err instanceof Error ? err.message : String(err))] };
  }
}

export function validateCommsPayload(payload: unknown): CommsImportValidation {
  let items: unknown[];
  try {
    items = itemsFromPayload(payload);
  } catch (err) {
    return { ok: false, templates: [], errors: [issue(-1, '$', err instanceof Error ? err.message : String(err))] };
  }
  if (!items.length) return { ok: false, templates: [], errors: [issue(-1, '$', 'The templates array cannot be empty.')] };

  const templates: CommsTemplate[] = [];
  const errors: CommsImportError[] = [];
  const ids = new Set<string>();
  items.forEach((item, index) => {
    const result = validateTemplate(item, index);
    errors.push(...result.errors);
    if (!result.template) return;
    if (ids.has(result.template.id)) errors.push(issue(index, 'id', `Duplicate template ID: ${result.template.id}`));
    else {
      ids.add(result.template.id);
      templates.push(result.template);
    }
  });
  return { ok: errors.length === 0, templates: templates.sort((a, b) => a.name.localeCompare(b.name)), errors };
}

export function mergeCommsTemplates(
  existing: CommsTemplate[],
  incoming: CommsTemplate[],
  mode: 'append' | 'replace',
): { templates: CommsTemplate[]; created: number; updated: number; replaced: boolean } {
  if (mode === 'replace') return { templates: incoming, created: incoming.length, updated: 0, replaced: true };
  const byId = new Map(existing.map((template) => [template.id, template]));
  let created = 0;
  let updated = 0;
  for (const template of incoming) {
    if (byId.has(template.id)) updated += 1;
    else created += 1;
    byId.set(template.id, template);
  }
  return { templates: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name)), created, updated, replaced: false };
}
