import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { shouldUseDiagnosticQuery } from '../dist/diagnostic-routing.js';
const require = createRequire(import.meta.url);

function usageMocks(t) {
  const events = [];
  t.mock.method(require('../dist/usage-guardrails.js'), 'assertAiUsageAllowed', async (feature, input, output) => {
    assert.equal(feature, 'diagnostic_routing');
    assert.ok(input > 0);
    assert.equal(output, 100);
    return 'routing-reservation';
  });
  t.mock.method(require('../dist/usage-guardrails.js'), 'recordAiUsage', async event => events.push(event));
  return events;
}

test('semantic query selection uses conversation, redacts identities and records real usage', async t => {
  const events = usageMocks(t);
  t.mock.method(require('../dist/ai-runtime.js'), 'generateAiText', async request => {
    const prompt = JSON.parse(request.prompt);
    assert.match(prompt.message, /puedo continuar/);
    assert.match(prompt.conversation, /training/);
    assert.doesNotMatch(request.prompt, /latam.coder779|secret@example.com|123456789012345678901234/);
    assert.match(request.system, /course progress, onboarding/);
    return { model: 'gemini-test', text: '{"use_query":true}', inputTokens: 105, outputTokens: 8 };
  });
  assert.equal(await shouldUseDiagnosticQuery('latam.coder779: puedo continuar? secret@example.com',
    'Previous: training, identifier 123456789012345678901234'), true);
  assert.equal(events[0].feature, 'diagnostic_routing');
  assert.equal(events[0].inputTokens, 105);
});

test('negative or malformed semantic decisions never grant query access', async t => {
  usageMocks(t);
  for (const text of ['{"use_query":false}', '{"use_query":"true"}', '{}']) {
    t.mock.method(require('../dist/ai-runtime.js'), 'generateAiText', async () => ({ model: 'gemini-test', text }));
    if (text.includes('false')) assert.equal(await shouldUseDiagnosticQuery('Thanks!'), false);
    else await assert.rejects(shouldUseDiagnosticQuery('Thanks!'), /Invalid diagnostic routing/);
  }
});

test('failed routing is accounted for and does not pretend the query ran', async t => {
  const events = usageMocks(t);
  t.mock.method(require('../dist/ai-runtime.js'), 'generateAiText', async () => { throw new Error('Provider unavailable'); });
  await assert.rejects(shouldUseDiagnosticQuery('Have I finished training?'), /Provider unavailable/);
  assert.equal(events[0].status, 'error');
});
