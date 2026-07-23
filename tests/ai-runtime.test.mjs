import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_GEMINI_MODEL,
  geminiRuntimeStatus,
  generateAiText,
  platformGeminiConfigured,
  validateGeminiApiKey,
} from '../dist/ai-runtime.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { platformAiLimits } from '../dist/usage-guardrails.js';

function withGeminiEnv(values, run) {
  const keys = new Set([
    ...Object.keys(values),
    'PLATFORM_GEMINI_API_KEY',
    'GEMINI_API_KEY',
    'GEMINI_MODEL',
    'GEMINI_API_BASE_URL',
  ]);
  const previous = Object.fromEntries([...keys].map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = String(value);
  }
  return Promise.resolve(run()).finally(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    globalThis.fetch = previousFetch;
  });
}

test('Gemini Free status never exposes the QM key', async () => {
  await withGeminiEnv({ PLATFORM_GEMINI_API_KEY: undefined, GEMINI_API_KEY: undefined, GEMINI_MODEL: '' }, () => {
    const status = runWithProjectContext({
      projectId: 'test-project',
      source: 'header',
      aiConfig: { provider: 'gemini', apiKey: 'qm-secret-key' },
    }, () => geminiRuntimeStatus());
    assert.deepEqual(status, {
      configured: true,
      provider: 'gemini',
      model: DEFAULT_GEMINI_MODEL,
      plan: 'free',
    });
    assert.equal(JSON.stringify(status).includes('qm-secret-key'), false);
  });
});

test('Gemini runtime reports a missing platform configuration when no key is available', async () => {
  await withGeminiEnv({ PLATFORM_GEMINI_API_KEY: undefined, GEMINI_API_KEY: undefined }, async () => {
    await assert.rejects(
      () => runWithProjectContext(
        { projectId: 'test-project', source: 'header', aiConfig: { provider: 'gemini' } },
        () => generateAiText({ system: 'Policy', prompt: 'Message', maxOutputTokens: 50 }),
      ),
      /not configured for this platform/i,
    );
  });
});

test('platform Gemini key takes priority over a legacy QM key', async () => {
  await withGeminiEnv({
    PLATFORM_GEMINI_API_KEY: 'platform-key',
    GEMINI_API_KEY: undefined,
    GEMINI_API_BASE_URL: 'https://gemini.test/v1beta',
  }, async () => {
    globalThis.fetch = async (_url, init) => {
      assert.equal(init.headers['x-goog-api-key'], 'platform-key');
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    assert.equal(platformGeminiConfigured(), true);
    await runWithProjectContext({
      projectId: 'test-project',
      source: 'header',
      aiConfig: { provider: 'gemini', apiKey: 'legacy-qm-key' },
    }, () => generateAiText({ system: 'Policy', prompt: 'Message', maxOutputTokens: 50 }));
  });
});

test('Gemini runtime sends JSON generation requests and returns usage', async () => {
  await withGeminiEnv({
    GEMINI_API_BASE_URL: 'https://gemini.test/v1beta',
  }, async () => {
    let requestBody;
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://gemini.test/v1beta/models/gemini-test-model:generateContent');
      assert.equal(init.headers['x-goog-api-key'], 'free-key');
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"action":"human"}' }] } }],
        usageMetadata: { promptTokenCount: 123, candidatesTokenCount: 17 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await runWithProjectContext({
      projectId: 'test-project',
      source: 'header',
      aiConfig: { provider: 'gemini', apiKey: 'free-key', model: 'gemini-test-model' },
    }, () => generateAiText({
        system: 'System policy',
        prompt: 'Incoming message',
        maxOutputTokens: 450,
      }));

    assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
    assert.equal(requestBody.systemInstruction.parts[0].text, 'System policy');
    assert.equal(result.text, '{"action":"human"}');
    assert.equal(result.model, 'gemini-test-model');
    assert.equal(result.inputTokens, 123);
    assert.equal(result.outputTokens, 17);
  });
});

test('Gemini quota errors do not fall back to a paid provider', async () => {
  await withGeminiEnv({}, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
    }), { status: 429, headers: { 'Content-Type': 'application/json' } });

    await assert.rejects(
      () => runWithProjectContext(
        {
          projectId: 'test-project',
          source: 'header',
          aiConfig: { provider: 'gemini', apiKey: 'free-key' },
        },
        () => generateAiText({ system: 'Policy', prompt: 'Message', maxOutputTokens: 50 }),
      ),
      /no paid fallback was used/i,
    );
  });
});

test('Gemini key validation lists available models without generating content', async () => {
  await withGeminiEnv({ GEMINI_API_BASE_URL: 'https://gemini.test/v1beta' }, async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://gemini.test/v1beta/models?pageSize=1000');
      assert.equal(init.method, 'GET');
      assert.equal(init.headers['x-goog-api-key'], 'candidate-key');
      return new Response(JSON.stringify({
        models: [{
          name: `models/${DEFAULT_GEMINI_MODEL}`,
          supportedGenerationMethods: ['generateContent'],
        }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    assert.deepEqual(await validateGeminiApiKey('candidate-key'), {
      valid: true,
      model: DEFAULT_GEMINI_MODEL,
    });
  });
});

test('Gemini key validation falls back to an available Flash-Lite model', async () => {
  await withGeminiEnv({ GEMINI_API_BASE_URL: 'https://gemini.test/v1beta' }, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      models: [{
        name: 'models/gemini-3.1-flash-lite',
        supportedGenerationMethods: ['generateContent'],
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

    assert.deepEqual(await validateGeminiApiKey('candidate-key'), {
      valid: true,
      model: 'gemini-3.1-flash-lite',
    });
  });
});

test('platform AI limits support global, project, and QM fair-use budgets', async () => {
  await withGeminiEnv({
    PLATFORM_AI_DAILY_TOKEN_LIMIT: '900000',
    PLATFORM_AI_DAILY_CALL_LIMIT: '900',
    AI_PROJECT_DAILY_TOKEN_LIMIT: '300000',
    AI_PROJECT_DAILY_CALL_LIMIT: '300',
    AI_DAILY_TOKEN_LIMIT: '60000',
    AI_DAILY_CALL_LIMIT: '60',
  }, () => {
    const limits = runWithProjectContext({
      projectId: 'test-project',
      source: 'header',
      ownerId: 'test-owner',
      aiConfig: { provider: 'gemini', dailyTokenLimit: 40_000, dailyCallLimit: 40 },
    }, () => platformAiLimits());
    assert.deepEqual(limits, {
      globalTokenLimit: 900000,
      globalCallLimit: 900,
      projectTokenLimit: 300000,
      projectCallLimit: 300,
      ownerTokenLimit: 40000,
      ownerCallLimit: 40,
    });
  });
});
