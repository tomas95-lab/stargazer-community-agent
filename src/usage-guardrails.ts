import { randomUUID } from 'crypto';
import { readDataJSON, writeDataJSON } from './data-store';
import { getProjectContext } from './project-context';

const FILE = 'output/ai-usage-state.json';
const MAX_EVENTS = 1000;

export interface AiUsageEvent {
  id: string;
  at: string;
  utcDate: string;
  argentinaDate?: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: 'success' | 'error' | 'blocked';
}

export interface AiUsageSummary {
  generatedAt: string;
  utcDate: string;
  argentinaDate?: string;
  today: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  limits: {
    dailyTokenLimit: number | null;
    dailyCallLimit: number | null;
    enforce: boolean;
  };
  remaining: {
    tokens: number | null;
    calls: number | null;
  };
  warnings: string[];
  recentEvents: AiUsageEvent[];
}

interface AiUsageState {
  events: AiUsageEvent[];
}

function utcDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

function numericEnv(key: string): number | null {
  const raw = process.env[key];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function numericLimit(value: unknown, envKey: string): number | null {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return numericEnv(envKey);
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeTokens(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
}

function currentAiModel(): string {
  return getProjectContext().aiConfig?.anthropicModel || process.env.ANTHROPIC_MODEL || 'unknown';
}

async function readState(): Promise<AiUsageState> {
  try {
    const state = await readDataJSON<AiUsageState>(FILE);
    return {
      events: Array.isArray(state.events) ? state.events : [],
    };
  } catch {
    return { events: [] };
  }
}

async function writeState(state: AiUsageState): Promise<void> {
  await writeDataJSON(
    FILE,
    {
      events: state.events
        .slice()
        .sort((left, right) => right.at.localeCompare(left.at))
        .slice(0, MAX_EVENTS),
    },
    'update ai usage state'
  );
}

function summarize(events: AiUsageEvent[], now = new Date()): AiUsageSummary {
  const date = utcDate(now);
  const todayEvents = events.filter((event) => (event.utcDate || event.argentinaDate) === date);
  const calls = todayEvents.length;
  const inputTokens = todayEvents.reduce((sum, event) => sum + event.inputTokens, 0);
  const outputTokens = todayEvents.reduce((sum, event) => sum + event.outputTokens, 0);
  const totalTokens = inputTokens + outputTokens;
  const context = getProjectContext();
  const dailyTokenLimit = numericLimit(context.aiConfig?.dailyTokenLimit, 'AI_DAILY_TOKEN_LIMIT');
  const dailyCallLimit = numericLimit(context.aiConfig?.dailyCallLimit, 'AI_DAILY_CALL_LIMIT');
  const enforce = process.env.AI_GUARDRAILS_ENFORCE === 'true';
  const warnings: string[] = [];

  if (dailyTokenLimit && totalTokens >= Math.floor(dailyTokenLimit * 0.8)) {
    warnings.push(`Today has used ${totalTokens} of ${dailyTokenLimit} configured AI tokens.`);
  }
  if (dailyCallLimit && calls >= Math.floor(dailyCallLimit * 0.8)) {
    warnings.push(`Today has used ${calls} of ${dailyCallLimit} configured AI calls.`);
  }

  return {
    generatedAt: now.toISOString(),
    utcDate: date,
    argentinaDate: date,
    today: {
      calls,
      inputTokens,
      outputTokens,
      totalTokens,
    },
    limits: {
      dailyTokenLimit,
      dailyCallLimit,
      enforce,
    },
    remaining: {
      tokens: dailyTokenLimit ? Math.max(0, dailyTokenLimit - totalTokens) : null,
      calls: dailyCallLimit ? Math.max(0, dailyCallLimit - calls) : null,
    },
    warnings,
    recentEvents: events.slice(0, 25),
  };
}

export async function getAiUsageSummary(now = new Date()): Promise<AiUsageSummary> {
  const state = await readState();
  return summarize(state.events, now);
}

export async function assertAiUsageAllowed(feature: string, estimatedInputTokens = 0, estimatedOutputTokens = 0): Promise<void> {
  const state = await readState();
  const summary = summarize(state.events);
  const expectedTokens = Math.max(0, estimatedInputTokens + estimatedOutputTokens);
  const projectedTokens = summary.today.totalTokens + expectedTokens;
  const projectedCalls = summary.today.calls + 1;

  if (summary.limits.enforce && summary.limits.dailyTokenLimit && projectedTokens > summary.limits.dailyTokenLimit) {
    await recordAiUsage({
      feature,
      model: currentAiModel(),
      inputTokens: estimatedInputTokens,
      outputTokens: 0,
      status: 'blocked',
    });
    throw new Error(`AI daily token limit reached for ${summary.utcDate}.`);
  }

  if (summary.limits.enforce && summary.limits.dailyCallLimit && projectedCalls > summary.limits.dailyCallLimit) {
    await recordAiUsage({
      feature,
      model: currentAiModel(),
      inputTokens: estimatedInputTokens,
      outputTokens: 0,
      status: 'blocked',
    });
    throw new Error(`AI daily call limit reached for ${summary.utcDate}.`);
  }
}

export async function recordAiUsage(input: {
  feature: string;
  model: string;
  inputTokens?: unknown;
  outputTokens?: unknown;
  inputText?: string;
  outputText?: string;
  status?: AiUsageEvent['status'];
}): Promise<AiUsageEvent | undefined> {
  const inputTokens = normalizeTokens(input.inputTokens) || (input.inputText ? estimateTokens(input.inputText) : 0);
  const outputTokens = normalizeTokens(input.outputTokens) || (input.outputText ? estimateTokens(input.outputText) : 0);
  const event: AiUsageEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    utcDate: utcDate(),
    argentinaDate: utcDate(),
    feature: input.feature,
    model: input.model || 'unknown',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    status: input.status || 'success',
  };

  try {
    const state = await readState();
    await writeState({ events: [event, ...state.events] });
    return event;
  } catch (err) {
    console.warn('Could not write AI usage event:', err);
    return undefined;
  }
}
