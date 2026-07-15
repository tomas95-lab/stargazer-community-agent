import { DailyThreadConfig } from './config';

export interface TopicValidationError {
  index: number;
  path: string;
  message: string;
}

export interface TopicValidationResult {
  ok: boolean;
  topics: DailyThreadConfig[];
  errors: TopicValidationError[];
}

export const TOPICS_JSON_EXAMPLE: DailyThreadConfig[] = [
  {
    date: '2026-07-20',
    title: 'Daily Quality Focus',
    topic: 'Rubric Quality',
    reminderTitle: 'Keep criteria observable',
    reminderBody: 'Criteria should describe visible, verifiable behavior.',
    goodExample: 'The response names the missing setup step and explains how to fix it.',
    badExample: 'The response is good and helpful.',
    quickRule: 'Observable beats vague.',
    tags: ['daily_project_announcements'],
    webinar: {
      enabled: false,
      mandatory: false,
      timeLabel: '',
      link: '',
      invitees: [],
    },
  },
];

const REQUIRED_TEXT_FIELDS: Array<keyof DailyThreadConfig> = [
  'date',
  'title',
  'topic',
  'reminderTitle',
  'reminderBody',
  'goodExample',
  'badExample',
  'quickRule',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(text).filter(Boolean);
}

function payloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.topics)) return record.topics;
  }
  throw new Error('JSON must be an array of topics or an object with a "topics" array.');
}

function error(index: number, path: string, message: string): TopicValidationError {
  return { index, path, message };
}

function normalizeTopic(item: unknown, index: number): { topic?: DailyThreadConfig; errors: TopicValidationError[] } {
  const errors: TopicValidationError[] = [];
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { errors: [error(index, '$', 'Each topic must be an object.')] };
  }

  const raw = item as Record<string, unknown>;
  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!text(raw[field])) errors.push(error(index, field, `${field} is required.`));
  }

  const date = text(raw.date);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push(error(index, 'date', 'date must use YYYY-MM-DD format.'));
  }

  if (raw.tags !== undefined && !Array.isArray(raw.tags)) {
    errors.push(error(index, 'tags', 'tags must be an array of strings.'));
  }

  let webinar: DailyThreadConfig['webinar'];
  if (raw.webinar !== undefined) {
    if (!raw.webinar || typeof raw.webinar !== 'object' || Array.isArray(raw.webinar)) {
      errors.push(error(index, 'webinar', 'webinar must be an object.'));
    } else {
      const rawWebinar = raw.webinar as Record<string, unknown>;
      webinar = {
        enabled: bool(rawWebinar.enabled),
        mandatory: bool(rawWebinar.mandatory),
        timeLabel: text(rawWebinar.timeLabel),
        link: text(rawWebinar.link),
        invitees: stringArray(rawWebinar.invitees),
      };
      if (webinar.enabled && !webinar.timeLabel) {
        errors.push(error(index, 'webinar.timeLabel', 'timeLabel is required when webinar.enabled is true.'));
      }
      if (webinar.enabled && !webinar.link) {
        errors.push(error(index, 'webinar.link', 'link is required when webinar.enabled is true.'));
      }
    }
  }

  if (errors.length > 0) return { errors };

  return {
    topic: {
      date,
      title: text(raw.title),
      topic: text(raw.topic),
      reminderTitle: text(raw.reminderTitle),
      reminderBody: text(raw.reminderBody),
      goodExample: text(raw.goodExample),
      badExample: text(raw.badExample),
      quickRule: text(raw.quickRule),
      tags: stringArray(raw.tags),
      ...(webinar ? { webinar } : {}),
    },
    errors: [],
  };
}

export function validateTopicsPayload(payload: unknown): TopicValidationResult {
  let items: unknown[];
  try {
    items = payloadItems(payload);
  } catch (err) {
    return {
      ok: false,
      topics: [],
      errors: [error(-1, '$', err instanceof Error ? err.message : String(err))],
    };
  }

  if (items.length === 0) {
    return {
      ok: false,
      topics: [],
      errors: [error(-1, '$', 'The topics array cannot be empty.')],
    };
  }

  const topics: DailyThreadConfig[] = [];
  const errors: TopicValidationError[] = [];
  const dates = new Set<string>();

  items.forEach((item, index) => {
    const normalized = normalizeTopic(item, index);
    errors.push(...normalized.errors);
    if (!normalized.topic) return;
    if (dates.has(normalized.topic.date)) {
      errors.push(error(index, 'date', `Duplicate date: ${normalized.topic.date}`));
      return;
    }
    dates.add(normalized.topic.date);
    topics.push(normalized.topic);
  });

  return {
    ok: errors.length === 0,
    topics: topics.sort((left, right) => left.date.localeCompare(right.date)),
    errors,
  };
}

export function mergeTopics(
  existing: DailyThreadConfig[],
  incoming: DailyThreadConfig[],
  mode: 'append' | 'replace',
): { topics: DailyThreadConfig[]; created: number; updated: number; replaced: boolean } {
  if (mode === 'replace') {
    return {
      topics: [...incoming].sort((left, right) => left.date.localeCompare(right.date)),
      created: incoming.length,
      updated: 0,
      replaced: true,
    };
  }

  const byDate = new Map(existing.map((topic) => [topic.date, topic]));
  let created = 0;
  let updated = 0;
  for (const topic of incoming) {
    if (byDate.has(topic.date)) updated += 1;
    else created += 1;
    byDate.set(topic.date, topic);
  }

  return {
    topics: Array.from(byDate.values()).sort((left, right) => left.date.localeCompare(right.date)),
    created,
    updated,
    replaced: false,
  };
}
