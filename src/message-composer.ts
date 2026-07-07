import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Anthropic from '@anthropic-ai/sdk';
import { loadProjectLinks } from './links';
import { appendOperationLog } from './operations-log';
import { findProjectGuidelineSnippets } from './project-guidelines';
import { sanitizeGeneratedText } from './text-safety';

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const SUPPORT_ASSISTANT_SIGNATURE = '- Stargazer Support Assistant';

export const COMPOSER_CHANNELS = ['community', 'dm', 'daily_thread', 'reminder', 'announcement'] as const;
export const COMPOSER_TONES = ['friendly', 'professional', 'direct', 'warm_supportive', 'urgent', 'short_clear'] as const;
export const COMPOSER_OBJECTIVES = ['inform', 'remind', 'ask_for_action', 'de_escalate', 'explain_guideline'] as const;

export type ComposerChannel = typeof COMPOSER_CHANNELS[number];
export type ComposerTone = typeof COMPOSER_TONES[number];
export type ComposerObjective = typeof COMPOSER_OBJECTIVES[number];

export interface MessageComposerInput {
  prompt?: unknown;
  audience?: unknown;
  channel?: unknown;
  tone?: unknown;
  objective?: unknown;
  extraContext?: unknown;
  variantCount?: unknown;
  includeWarRoomLink?: unknown;
  includeSignature?: unknown;
}

export interface NormalizedComposerRequest {
  prompt: string;
  audience: string;
  channel: ComposerChannel;
  tone: ComposerTone;
  objective: ComposerObjective;
  extraContext: string;
  variantCount: number;
  includeWarRoomLink: boolean;
  includeSignature: boolean;
}

export interface ComposerVariant {
  title?: string;
  message: string;
  notes?: string;
  warnings: string[];
}

export interface MessageComposerResult {
  mode: 'composer';
  generatedAt: string;
  channel: ComposerChannel;
  tone: ComposerTone;
  objective: ComposerObjective;
  audience: string;
  variants: ComposerVariant[];
  guidelineSnippets: string[];
}

interface ClaudeComposerVariant {
  title?: unknown;
  message?: unknown;
  notes?: unknown;
  warnings?: unknown;
}

interface ClaudeComposerResponse {
  variants?: ClaudeComposerVariant[];
}

function oneOf<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return allowed.includes(value as T[number]) ? value as T[number] : fallback;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function normalizeComposerRequest(input: MessageComposerInput): NormalizedComposerRequest {
  const prompt = text(input.prompt);
  if (!prompt) throw new Error('Describe what you want to communicate.');
  if (prompt.length > 3000) throw new Error('Description is too long. Keep it under 3000 characters.');

  const extraContext = text(input.extraContext);
  if (extraContext.length > 3000) throw new Error('Context is too long. Keep it under 3000 characters.');

  return {
    prompt,
    audience: text(input.audience, 'Stargazer contributors') || 'Stargazer contributors',
    channel: oneOf(input.channel, COMPOSER_CHANNELS, 'community'),
    tone: oneOf(input.tone, COMPOSER_TONES, 'professional'),
    objective: oneOf(input.objective, COMPOSER_OBJECTIVES, 'inform'),
    extraContext,
    variantCount: clampNumber(input.variantCount, 1, 1, 3),
    includeWarRoomLink: input.includeWarRoomLink === true,
    includeSignature: input.includeSignature === true,
  };
}

function extractJson(text: string): ClaudeComposerResponse {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Claude returned non-JSON content: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as ClaudeComposerResponse;
}

function anthropicText(response: { content?: Array<{ type: string; text?: string }> }): string {
  const block = response.content?.find((item) => item.type === 'text');
  return block?.text || '';
}

function label(value: string): string {
  return value.replace(/_/g, ' ');
}

function withSignature(message: string, includeSignature: boolean): string {
  const trimmed = sanitizeGeneratedText(message).trim();
  if (!includeSignature || !trimmed) return trimmed;
  if (trimmed.toLowerCase().includes(SUPPORT_ASSISTANT_SIGNATURE.toLowerCase())) return trimmed;
  return `${trimmed}\n\n${SUPPORT_ASSISTANT_SIGNATURE}`;
}

function normalizeVariant(raw: ClaudeComposerVariant | undefined, includeSignature: boolean): ComposerVariant | null {
  const message = text(raw?.message);
  if (!message) return null;
  const warnings = Array.isArray(raw?.warnings)
    ? raw.warnings.map((item: unknown) => text(item)).filter(Boolean).slice(0, 5)
    : [];

  return {
    title: text(raw?.title) || undefined,
    message: withSignature(message, includeSignature),
    notes: text(raw?.notes) || undefined,
    warnings,
  };
}

export async function generateComposedMessage(input: MessageComposerInput): Promise<MessageComposerResult> {
  const request = normalizeComposerRequest(input);
  const apiKey = process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const links = await loadProjectLinks();
  const snippets = await findProjectGuidelineSnippets(`${request.prompt}\n${request.extraContext}`, 5);
  const anthropic = new Anthropic({ apiKey });

  try {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: request.variantCount === 1 ? 700 : 1200,
      temperature: 0.4,
      system: [
        'You are a message composer for the Stargazer Axiom community management team.',
        'Always write user-facing content in English, even when the user request is in Spanish or another language.',
        'Do not write Spanish user-facing copy.',
        'Never use the em dash character U+2014. Use commas, parentheses, or a regular hyphen instead.',
        'Use the provided project guideline excerpts and project links as the source of truth.',
        'Do not invent deadlines, eligibility rules, project policy, pay details, access rules, or links.',
        'If a requested detail is not supported, keep the message general and add a concise warning in the JSON warnings array.',
        'Keep copy operational, clear, and suitable for repeated community workflows.',
        'Return only valid JSON with key "variants". Each variant must contain: title, message, notes, warnings.',
      ].join(' '),
      messages: [
        {
          role: 'user',
          content: [
            `Task:\n${request.prompt}`,
            `Audience:\n${request.audience}`,
            `Channel:\n${label(request.channel)}`,
            `Tone:\n${label(request.tone)}`,
            `Objective:\n${label(request.objective)}`,
            `Number of variants:\n${request.variantCount}`,
            request.extraContext ? `Additional context:\n${request.extraContext}` : '',
            `War Room handling:\n${request.includeWarRoomLink ? `Include this War Room link when relevant: ${links.warRoom}` : 'Do not include the War Room link unless the task explicitly requires mentioning it.'}`,
            'Signature handling:\nDo not add an assistant signature yourself. The system handles signatures after generation when enabled.',
            `Project links:\nGuidelines: ${links.guidelines}\nTemplates: ${links.templatesZip}\nValidation script: ${links.validationScript}\nCommon errors: ${links.commonErrorsDocument}`,
            `Project guideline excerpts:\n${snippets.length ? snippets.join('\n\n---\n\n') : 'No guideline text available.'}`,
          ].filter(Boolean).join('\n\n'),
        },
      ],
    });

    const parsed = extractJson(anthropicText(response));
    const variants = (parsed.variants || [])
      .map((variant) => normalizeVariant(variant, request.includeSignature))
      .filter((variant): variant is ComposerVariant => Boolean(variant))
      .slice(0, request.variantCount);

    if (variants.length === 0) throw new Error('Claude did not return any usable message variants.');

    await appendOperationLog({
      action: 'message_composer',
      status: 'success',
      message: `Generated ${variants.length} message draft(s)`,
      metadata: {
        channel: request.channel,
        tone: request.tone,
        objective: request.objective,
        variantCount: variants.length,
        guidelineSnippets: snippets.length,
      },
    });

    return {
      mode: 'composer',
      generatedAt: new Date().toISOString(),
      channel: request.channel,
      tone: request.tone,
      objective: request.objective,
      audience: request.audience,
      variants,
      guidelineSnippets: snippets,
    };
  } catch (err) {
    await appendOperationLog({
      action: 'message_composer',
      status: 'error',
      message: err instanceof Error ? err.message : String(err),
      metadata: {
        channel: request.channel,
        tone: request.tone,
        objective: request.objective,
      },
    });
    throw err;
  }
}
