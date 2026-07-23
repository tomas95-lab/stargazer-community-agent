import { getProjectContext } from './project-context';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL_PREFERENCES = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

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
  const model = configuredModel();
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
        ...(request.json === false ? {} : { responseMimeType: 'application/json' }),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  let payload: GeminiResponse = {};
  try {
    payload = await response.json() as GeminiResponse;
  } catch {
    // The status code below still gives callers a useful provider error.
  }

  if (!response.ok) throw new Error(errorMessage(response.status, payload));

  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim() || '';
  if (!text) {
    const reason = payload.promptFeedback?.blockReason || payload.candidates?.[0]?.finishReason || 'empty response';
    throw new Error(`Gemini did not return usable content (${reason}).`);
  }

  return {
    text,
    model,
    provider: 'gemini',
    inputTokens: payload.usageMetadata?.promptTokenCount,
    outputTokens: payload.usageMetadata?.candidatesTokenCount,
  };
}
