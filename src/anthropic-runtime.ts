import Anthropic from '@anthropic-ai/sdk';
import { getProjectContext, isLegacyProjectId } from './project-context';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

export interface ResolvedAnthropicRuntime {
  client: Anthropic;
  apiKey: string;
  model: string;
  source: 'project' | 'legacy-env';
}

function configuredModel(value: string | undefined): string {
  return (value || '').trim() || DEFAULT_ANTHROPIC_MODEL;
}

export function resolveAnthropicRuntime(): ResolvedAnthropicRuntime {
  const context = getProjectContext();
  const projectApiKey = (context.aiConfig?.anthropicApiKey || '').trim();
  const projectModel = configuredModel(context.aiConfig?.anthropicModel);

  if (projectApiKey) {
    return {
      client: new Anthropic({ apiKey: projectApiKey }),
      apiKey: projectApiKey,
      model: projectModel,
      source: 'project',
    };
  }

  const legacyApiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const canUseLegacyEnv = isLegacyProjectId(context.projectId) && context.source === 'default';
  if (canUseLegacyEnv && legacyApiKey) {
    return {
      client: new Anthropic({ apiKey: legacyApiKey }),
      apiKey: legacyApiKey,
      model: configuredModel(process.env.ANTHROPIC_MODEL),
      source: 'legacy-env',
    };
  }

  throw new Error('Anthropic API key is not configured for this project. Add your own Anthropic API key in Project Settings.');
}

