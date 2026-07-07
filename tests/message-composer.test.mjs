import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeComposerRequest } from '../dist/message-composer.js';

test('message composer normalizes defaults and trims text fields', () => {
  const result = normalizeComposerRequest({
    prompt: '  remind contributors about Cursor access  ',
    audience: '',
    variantCount: '9',
  });

  assert.equal(result.prompt, 'remind contributors about Cursor access');
  assert.equal(result.audience, 'Stargazer contributors');
  assert.equal(result.channel, 'community');
  assert.equal(result.tone, 'professional');
  assert.equal(result.objective, 'inform');
  assert.equal(result.variantCount, 3);
  assert.equal(result.includeWarRoomLink, false);
});

test('message composer accepts supported options', () => {
  const result = normalizeComposerRequest({
    prompt: 'Explain guideline step zero.',
    channel: 'dm',
    tone: 'warm_supportive',
    objective: 'explain_guideline',
    variantCount: 2,
    includeWarRoomLink: true,
  });

  assert.equal(result.channel, 'dm');
  assert.equal(result.tone, 'warm_supportive');
  assert.equal(result.objective, 'explain_guideline');
  assert.equal(result.variantCount, 2);
  assert.equal(result.includeWarRoomLink, true);
});

test('message composer requires a prompt', () => {
  assert.throws(
    () => normalizeComposerRequest({ prompt: '   ' }),
    /Describe what you want to communicate/
  );
});
