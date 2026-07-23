import { randomUUID } from 'crypto';
import { readDataJSON, writeDataJSON } from './data-store';
import { getProjectContext } from './project-context';
import { appDateParts } from './timezone';
import { runtimeDb, runtimeDbConfigured, runtimeScope, runtimeTableMissing } from './runtime-db';
import { platformGeminiConfigured } from './ai-runtime';

const FILE = 'output/ai-usage-state.json';
const MAX_EVENTS = 1000;

export interface AiUsageEvent {
  id: string;
  at: string;
  utcDate: string;
  argentinaDate?: string;
  projectId?: string;
  ownerId?: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  status: 'success' | 'error' | 'blocked' | 'reserved';
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
  return appDateParts(now).label;
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
  return numericEnv(envKey) || (envKey === 'AI_DAILY_TOKEN_LIMIT' ? 50_000 : 100);
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function normalizeTokens(value: unknown): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : 0;
}

function currentAiModel(): string {
  return getProjectContext().aiConfig?.model || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
}

function configuredLimit(envKey: string, fallback: number): number {
  return numericEnv(envKey) || fallback;
}

export interface PlatformAiLimits {
  globalTokenLimit: number;
  globalCallLimit: number;
  projectTokenLimit: number;
  projectCallLimit: number;
  ownerTokenLimit: number;
  ownerCallLimit: number;
}

export function platformAiLimits(): PlatformAiLimits {
  const context = getProjectContext();
  return {
    globalTokenLimit: configuredLimit('PLATFORM_AI_DAILY_TOKEN_LIMIT', 500_000),
    globalCallLimit: configuredLimit('PLATFORM_AI_DAILY_CALL_LIMIT', 500),
    projectTokenLimit: configuredLimit('AI_PROJECT_DAILY_TOKEN_LIMIT', 200_000),
    projectCallLimit: configuredLimit('AI_PROJECT_DAILY_CALL_LIMIT', 200),
    ownerTokenLimit: numericLimit(context.aiConfig?.dailyTokenLimit, 'AI_DAILY_TOKEN_LIMIT') || 50_000,
    ownerCallLimit: numericLimit(context.aiConfig?.dailyCallLimit, 'AI_DAILY_CALL_LIMIT') || 100,
  };
}

async function readState(): Promise<AiUsageState> {
  if (runtimeDbConfigured()) {
    try {
      const scope = runtimeScope();
      let query = runtimeDb().from('ai_usage_events').select('*').eq('project_key', scope.projectKey)
        .order('created_at', { ascending: false }).limit(MAX_EVENTS);
      if (scope.ownerId) query = query.eq('owner_id', scope.ownerId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return {
        events: (data || []).map((row) => ({
          id: row.id,
          at: row.created_at,
          utcDate: appDateParts(new Date(row.created_at)).label,
          argentinaDate: appDateParts(new Date(row.created_at)).label,
          projectId: row.project_key,
          ownerId: row.owner_id || undefined,
          feature: row.feature,
          model: row.model,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          totalTokens: row.input_tokens + row.output_tokens,
          status: row.status,
        })) as AiUsageEvent[],
      };
    } catch (err) {
      if (!runtimeTableMissing(err)) throw err;
    }
  }
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
  const context = getProjectContext();
  const scopedEvents = events.filter((event) => {
    if (context.ownerId) return event.ownerId === context.ownerId;
    if (event.ownerId) return false;
    return !event.projectId || event.projectId === context.projectId;
  });
  const todayEvents = scopedEvents.filter((event) => (event.utcDate || event.argentinaDate) === date);
  const calls = todayEvents.length;
  const inputTokens = todayEvents.reduce((sum, event) => sum + event.inputTokens, 0);
  const outputTokens = todayEvents.reduce((sum, event) => sum + event.outputTokens, 0);
  const totalTokens = inputTokens + outputTokens;
  const dailyTokenLimit = numericLimit(context.aiConfig?.dailyTokenLimit, 'AI_DAILY_TOKEN_LIMIT');
  const dailyCallLimit = numericLimit(context.aiConfig?.dailyCallLimit, 'AI_DAILY_CALL_LIMIT');
  const enforce = context.aiConfig?.provider === 'gemini'
    || context.aiConfig?.enforceLimits === true
    || process.env.AI_GUARDRAILS_ENFORCE === 'true';
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
    recentEvents: scopedEvents.slice(0, 25),
  };
}

export async function getAiUsageSummary(now = new Date()): Promise<AiUsageSummary> {
  const state = await readState();
  return summarize(state.events, now);
}

function quotaRpcMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message || error || '');
  return runtimeTableMissing(error) || /reserve_ai_usage|PGRST202|function .* does not exist/i.test(message);
}

async function reservePlatformUsage(
  feature: string,
  estimatedInputTokens: number,
  estimatedOutputTokens: number,
): Promise<string | undefined> {
  if (!runtimeDbConfigured() || !platformGeminiConfigured()) return undefined;

  const scope = runtimeScope();
  const limits = platformAiLimits();
  const reservationId = randomUUID();
  const { data, error } = await runtimeDb().rpc('reserve_ai_usage', {
    p_reservation_id: reservationId,
    p_project_key: scope.projectKey,
    p_owner_id: scope.ownerId,
    p_feature: feature,
    p_model: currentAiModel(),
    p_input_tokens: normalizeTokens(estimatedInputTokens),
    p_output_tokens: normalizeTokens(estimatedOutputTokens),
    p_global_call_limit: limits.globalCallLimit,
    p_global_token_limit: limits.globalTokenLimit,
    p_project_call_limit: limits.projectCallLimit,
    p_project_token_limit: limits.projectTokenLimit,
    p_owner_call_limit: limits.ownerCallLimit,
    p_owner_token_limit: limits.ownerTokenLimit,
  });
  if (error) {
    if (quotaRpcMissing(error)) return undefined;
    throw new Error(`Could not reserve Gemini quota: ${error.message}`);
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    allowed?: boolean;
    reason?: string;
    scope?: string;
  } | null;
  if (!result?.allowed) {
    const scopeLabel = result?.scope ? ` for ${result.scope}` : '';
    throw new Error(result?.reason || `Gemini daily quota reached${scopeLabel}. This message requires human review.`);
  }
  return reservationId;
}

export async function assertAiUsageAllowed(
  feature: string,
  estimatedInputTokens = 0,
  estimatedOutputTokens = 0,
): Promise<string | undefined> {
  const reservationId = await reservePlatformUsage(feature, estimatedInputTokens, estimatedOutputTokens);
  if (reservationId) return reservationId;

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

  return undefined;
}

export async function recordAiUsage(input: {
  feature: string;
  model: string;
  inputTokens?: unknown;
  outputTokens?: unknown;
  inputText?: string;
  outputText?: string;
  status?: AiUsageEvent['status'];
  reservationId?: string;
}): Promise<AiUsageEvent | undefined> {
  const inputTokens = normalizeTokens(input.inputTokens) || (input.inputText ? estimateTokens(input.inputText) : 0);
  const outputTokens = normalizeTokens(input.outputTokens) || (input.outputText ? estimateTokens(input.outputText) : 0);
  const context = getProjectContext();
  const event: AiUsageEvent = {
    id: input.reservationId || randomUUID(),
    at: new Date().toISOString(),
    utcDate: utcDate(),
    argentinaDate: utcDate(),
    projectId: context.projectId,
    ...(context.ownerId ? { ownerId: context.ownerId } : {}),
    feature: input.feature,
    model: input.model || 'unknown',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    status: input.status || 'success',
  };

  try {
    if (runtimeDbConfigured()) {
      try {
        const scope = runtimeScope();
        const row = {
          id: event.id,
          project_key: scope.projectKey,
          owner_id: scope.ownerId,
          feature: event.feature,
          model: event.model,
          input_tokens: event.inputTokens,
          output_tokens: event.outputTokens,
          status: event.status,
          created_at: event.at,
        };
        const operation = input.reservationId
          ? runtimeDb().from('ai_usage_events').update(row).eq('id', input.reservationId).eq('status', 'reserved')
          : runtimeDb().from('ai_usage_events').insert(row);
        const { error } = await operation;
        if (error) throw new Error(error.message);
        return event;
      } catch (err) {
        if (!runtimeTableMissing(err)) throw err;
      }
    }
    const state = await readState();
    await writeState({ events: [event, ...state.events] });
    return event;
  } catch (err) {
    console.warn('Could not write AI usage event:', err);
    return undefined;
  }
}
