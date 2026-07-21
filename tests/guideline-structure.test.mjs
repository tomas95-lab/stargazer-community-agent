import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkGuidelineText, rankGuidelineChunks } from '../dist/guideline-structure.js';

test('guideline chunks preserve page context and markdown tables', () => {
  const text = [
    '## Page 1',
    'General onboarding information.',
    '## Page 2',
    '### Access status',
    '| Status | Next step |\n| --- | --- |\n| EQ | Request Cursor access |',
  ].join('\n\n');
  const chunks = chunkGuidelineText(text, 700);
  const tableChunk = chunks.find((chunk) => chunk.text.includes('| EQ |'));
  assert.ok(tableChunk);
  assert.equal(tableChunk.page, 2);
  assert.match(tableChunk.text, /Access status/);
});

test('guideline ranking selects the relevant section from a long document', () => {
  const text = [
    '## Page 1\n\nWelcome and general project overview.',
    '## Page 2\n\nQuality review instructions and examples.',
    '## Page 3\n\n### Cursor access\n\nContributors who are EQ must request Cursor access in the War Room.',
  ].join('\n\n');
  const ranked = rankGuidelineChunks(chunkGuidelineText(text, 500), 'Why am I EQ and how do I get Cursor?', 2);
  assert.match(ranked[0].text, /request Cursor access/);
});
