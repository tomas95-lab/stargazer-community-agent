import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeChannelGuidelines } from '../dist/channel-guidelines.js';
import { findGuidelineSnippetsForChannel, projectGuidelinesStatus } from '../dist/project-guidelines.js';
import { runWithProjectContext } from '../dist/project-context.js';

function guideline(channelId, title, text) {
  return {
    channelId,
    channelTitle: title,
    sourceUrl: `https://community.outlier.ai/t/instructions/${channelId}`,
    sourceTitle: `${title} instructions`,
    sourceAuthor: 'manager',
    text,
    characters: text.length,
    syncedAt: '2026-08-12T18:00:00.000Z',
  };
}

test('channel guidelines are normalized, deduplicated, and limited to managed channels', () => {
  const result = normalizeChannelGuidelines([
    guideline('10', 'Alpha', 'Old alpha instructions'),
    guideline('10', 'Alpha', 'Current alpha instructions'),
    guideline('20', 'Beta', 'Beta instructions'),
    guideline('../30', 'Invalid', 'Invalid instructions'),
  ], ['10']);

  assert.equal(result.length, 1);
  assert.equal(result[0].channelId, '10');
  assert.equal(result[0].text, 'Current alpha instructions');
  assert.equal(result[0].characters, 'Current alpha instructions'.length);
});

test('guideline retrieval prioritizes the matching channel and keeps global fallback context', async () => {
  const alpha = guideline('10', 'Alpha support', 'For refund requests in Alpha, direct the contributor to Alpha Form A.');
  const beta = guideline('20', 'Beta support', 'For refund requests in Beta, direct the contributor to Beta Form B.');
  const context = {
    projectId: 'channel-guideline-test',
    projectName: 'Channel guideline test',
    source: 'header',
    projectGuidelines: 'Global support rule: never promise that a refund has been approved.',
    channelGuidelines: [alpha, beta],
  };

  const snippets = await runWithProjectContext(context, () => (
    findGuidelineSnippetsForChannel('What should I do about a refund?', '10', 4)
  ));
  const combined = snippets.join('\n');

  assert.match(combined, /Channel guideline: Alpha support/);
  assert.match(combined, /Alpha Form A/);
  assert.doesNotMatch(combined, /Beta Form B/);
  assert.match(combined, /Global guideline/);

  const status = await runWithProjectContext(context, () => projectGuidelinesStatus());
  assert.equal(status.available, true);
  assert.equal(status.channelGuidelines, 2);
});
