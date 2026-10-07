import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectBrief } from '../dist/guideline-brief.js';

test('project brief keeps orientation while leaving detailed sections retrievable', () => {
  const guidelines = [
    '## Page 1',
    'Money Heist Attempter - Guidelines',
    '## Page 2',
    'Project Overview',
    'Evaluate banking support conversations and build rubrics for the ideal trajectory.',
    'Project Workflow',
    'Review the persona, run both agents, audit the trajectory, and build atomic criteria.',
    '## Page 3',
    'Money Heist Agent Tools Reference',
    'A very detailed tool catalog that should remain available for retrieval but not dominate the brief.',
  ].join('\n\n');
  const brief = buildProjectBrief(guidelines, 1200);

  assert.match(brief, /Money Heist Attempter/);
  assert.match(brief, /Project Overview/);
  assert.match(brief, /Project Workflow/);
  assert.match(brief, /orientation only/);
  assert.ok(brief.length <= 1203);
});
