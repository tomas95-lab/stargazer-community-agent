import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAnthropicRuntime } from '../dist/anthropic-runtime.js';
import { LEGACY_PROJECT_ID, runWithProjectContext } from '../dist/project-context.js';

test('platform projects cannot fall back to the global Anthropic key', () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'legacy-only-key';

  try {
    assert.throws(
      () => runWithProjectContext(
        { projectId: 'external-project', source: 'header', projectName: 'External Project' },
        () => resolveAnthropicRuntime(),
      ),
      /not configured for this project/
    );
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('project Anthropic key wins over the global fallback', () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'legacy-only-key';

  try {
    const runtime = runWithProjectContext(
      {
        projectId: 'external-project',
        source: 'header',
        projectName: 'External Project',
        aiConfig: {
          anthropicApiKey: 'project-key',
          anthropicModel: 'claude-haiku-4-5',
        },
      },
      () => resolveAnthropicRuntime(),
    );

    assert.equal(runtime.apiKey, 'project-key');
    assert.equal(runtime.model, 'claude-haiku-4-5');
    assert.equal(runtime.source, 'project');
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

test('legacy default project can still use the global Anthropic key', () => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'legacy-only-key';

  try {
    const runtime = runWithProjectContext(
      { projectId: LEGACY_PROJECT_ID, source: 'default', projectName: 'Stargazer' },
      () => resolveAnthropicRuntime(),
    );

    assert.equal(runtime.apiKey, 'legacy-only-key');
    assert.equal(runtime.source, 'legacy-env');
  } finally {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
  }
});

