import { getProjectContext } from './project-context';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL_PREFERENCES = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
];
const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_TOTAL_TIMEOUT_MS = 50_000;
const DEFAULT_COOLDOWN_MS = 60_000;
let unavailableUntil = 0;

export interface AiGenerationRequest {
  system: string;
  prompt: string;
  maxOutputTokens: number;
  temperature?: number;
  json?: boolean;
}

export interface AiGenerationResult {
  text: string;
  model: string;
  provider: 'gemini';
  inputTokens?: number;
  outputTokens?: number;
}

interface GeminiResponse {
  models?: Array<{
    name?: string;
    supportedGenerationMethods?: string[];
  }>;
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'GeminiRequestError';
  }
}

function configuredModel(): string {
  return (process.env.GEMINI_MODEL || '').trim()
    || getProjectContext().aiConfig?.model?.trim()
    || DEFAULT_GEMINI_MODEL;
}

export function platformGeminiApiKey(): string {
  return (process.env.PLATFORM_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '').trim();
}

export function platformGeminiConfigured(): boolean {
  return Boolean(platformGeminiApiKey());
}

function apiKey(): string {
  const value = platformGeminiApiKey() || getProjectContext().aiConfig?.apiKey?.trim() || '';
  if (!value) {
    throw new Error('Gemini is not configured for this platform. Ask an administrator to configure PLATFORM_GEMINI_API_KEY.');
  }
  return value;
}

function endpoint(model: string): string {
  const baseUrl = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta')
    .trim()
    .replace(/\/+$/, '');
  return `${baseUrl}/models/${encodeURIComponent(model)}:generateContent`;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function candidateModels(primary: string): string[] {
  const configuredFallbacks = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
  return [...new Set([primary, ...(configuredFallbacks.length ? configuredFallbacks : GEMINI_MODEL_PREFERENCES)])];
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('retry-after')?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function transientStatus(status: number | undefined): boolean {
  return status === 408 || status === 500 || status === 502 || status === 503 || status === 504;
}

function transientNetworkError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || error.name === 'TimeoutError' || error instanceof TypeError);
}

function wait(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function errorMessage(status: number, payload: GeminiResponse): string {
  if (status === 429) {
    return 'Gemini Free quota is temporarily exhausted. AI actions are paused until Google resets the quota; no paid fallback was used.';
  }
  if (status === 403) {
    return 'Gemini rejected the platform API key. An administrator must rotate or reconfigure PLATFORM_GEMINI_API_KEY.';
  }
  return `Gemini API error ${status}: ${payload.error?.message || payload.error?.status || 'Unknown error'}`;
}

export function geminiRuntimeStatus(): { configured: boolean; provider: 'gemini'; model: string; plan: 'free' } {
  return {
    configured: platformGeminiConfigured() || Boolean(getProjectContext().aiConfig?.apiKey?.trim()),
    provider: 'gemini',
    model: configuredModel(),
    plan: 'free',
  };
}

export async function validateGeminiApiKey(
  candidateApiKey: string,
  model = DEFAULT_GEMINI_MODEL,
): Promise<{ valid: true; model: string }> {
  const key = candidateApiKey.trim();
  if (!key) throw new Error('Paste a Gemini API key first.');

  const baseUrl = (process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta')
    .trim()
    .replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/models?pageSize=1000`, {
    method: 'GET',
    headers: { 'x-goog-api-key': key },
    signal: AbortSignal.timeout(10_000),
  });

  let payload: GeminiResponse = {};
  try {
    payload = await response.json() as GeminiResponse;
  } catch {
    // The HTTP status still provides a useful validation error.
  }
  if (!response.ok) throw new Error(errorMessage(response.status, payload));

  const available = new Set(
    (payload.models || [])
      .filter((item) => item.supportedGenerationMethods?.includes('generateContent'))
      .map((item) => (item.name || '').replace(/^models\//, ''))
      .filter(Boolean),
  );
  const selected = [model, ...GEMINI_MODEL_PREFERENCES].find((candidate) => available.has(candidate));
  if (!selected) {
    throw new Error('This Gemini key is valid, but it does not expose a supported Flash model. Create the key from Google AI Studio and try again.');
  }
  return { valid: true, model: selected };
}

export async function generateAiText(request: AiGenerationRequest): Promise<AiGenerationResult> {
  if (Date.now() < unavailableUntil) {
    throw new Error('Gemini is temporarily unavailable and is cooling down. Try again in about a minute.');
  }

  const primaryModel = configuredModel();
  const models = candidateModels(primaryModel);
  const maxAttempts = boundedInteger(process.env.GEMINI_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, 6);
  const retryBaseMs = boundedInteger(process.env.GEMINI_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS, 0, 10_000);
  const requestTimeoutMs = boundedInteger(
    process.env.GEMINI_REQUEST_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS,
    1_000,
    60_000,
  );
  const totalTimeoutMs = boundedInteger(
    process.env.GEMINI_TOTAL_TIMEOUT_MS,
    DEFAULT_TOTAL_TIMEOUT_MS,
    5_000,
    120_000,
  );
  const cooldownMs = boundedInteger(process.env.GEMINI_COOLDOWN_MS, DEFAULT_COOLDOWN_MS, 0, 300_000);
  const modelPlan = [primaryModel, ...models.slice(1), primaryModel].slice(0, maxAttempts);
  const unavailableModels = new Set<string>();
  const attemptedModels = new Set<string>();
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown;

  for (const model of modelPlan) {
    if (unavailableModels.has(model)) continue;
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt);
    if (remainingMs < 1_000) break;
    attempts += 1;
    attemptedModels.add(model);

    try {
      const response = await fetch(endpoint(model), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey(),
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: request.system }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: request.prompt }],
            },
          ],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
            ...(request.json === false ? {} : { responseMimeType: 'application/json' }),
          },
        }),
        signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remainingMs)),
      });

      let payload: GeminiResponse = {};
      try {
        payload = await response.json() as GeminiResponse;
      } catch {
        // The status code below still gives callers a useful provider error.
      }

      if (!response.ok) {
        throw new GeminiRequestError(errorMessage(response.status, payload), response.status, retryAfterMs(response));
      }

      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || '')
        .join('')
        .trim() || '';
      if (!text) {
        const reason = payload.promptFeedback?.blockReason || payload.candidates?.[0]?.finishReason || 'empty response';
        throw new Error(`Gemini did not return usable content (${reason}).`);
      }

      unavailableUntil = 0;
      return {
        text,
        model,
        provider: 'gemini',
        inputTokens: payload.usageMetadata?.promptTokenCount,
        outputTokens: payload.usageMetadata?.candidatesTokenCount,
      };
    } catch (error) {
      lastError = error;
      if (error instanceof GeminiRequestError && error.status === 404) {
        unavailableModels.add(model);
        continue;
      }
      if (!(error instanceof GeminiRequestError ? transientStatus(error.status) : transientNetworkError(error))) {
        throw error;
      }

      const exponentialMs = retryBaseMs * (2 ** Math.max(0, attempts - 1));
      const jitterMs = retryBaseMs > 0 ? Math.floor(Math.random() * Math.max(1, retryBaseMs / 2)) : 0;
      const providerDelayMs = error instanceof GeminiRequestError ? error.retryAfterMs || 0 : 0;
      const delayMs = Math.min(10_000, Math.max(providerDelayMs, exponentialMs + jitterMs));
      const timeLeftMs = totalTimeoutMs - (Date.now() - startedAt);
      if (attempts < modelPlan.length && delayMs < timeLeftMs) await wait(delayMs);
    }
  }

  if ((lastError instanceof GeminiRequestError && transientStatus(lastError.status)) || transientNetworkError(lastError)) {
    unavailableUntil = Date.now() + cooldownMs;
    throw new Error(
      `Gemini is temporarily unavailable after ${attempts} bounded attempts across ${attemptedModels.size} Flash models. Try again in a few minutes.`,
    );
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error('Gemini is temporarily unavailable. Try again in a few minutes.');
}
