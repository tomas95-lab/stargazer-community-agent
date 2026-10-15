import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProjectBrief } from '../dist/guideline-brief.js';
import { projectGuidelineBriefStatus } from '../dist/project-guidelines.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dataStore = require('../dist/data-store.js');
const { saveProjectGuidelineBrief } = require('../dist/project-guidelines.js');

test('QM brief persists without clipping and stays isolated by project', async (t) => {
  const saved = new Map();
  const { getCurrentProjectId } = require('../dist/project-context.js');
  t.mock.method(dataStore, 'readDataJSONOrDefault', async (_path, fallback) => saved.get(getCurrentProjectId()) ?? fallback);
  t.mock.method(dataStore, 'writeDataJSON', async (_path, value) => { saved.set(getCurrentProjectId(), value); });
  const context = { projectId: 'editable-brief', source: 'header', projectGuidelines: 'Project Overview\nOriginal project instructions for contributors.' };
  const brief = 'QM verified policy. '.repeat(200);
  await runWithProjectContext(context, async () => {
    const result = await saveProjectGuidelineBrief(brief);
    assert.equal(result.brief, brief.trim());
    assert.equal((await projectGuidelineBriefStatus()).brief, brief.trim());
    await assert.rejects(saveProjectGuidelineBrief(''), /Enter a project brief/);
    await assert.rejects(saveProjectGuidelineBrief('x'.repeat(20001)), /20,000/);
  });
  const other = await runWithProjectContext({ ...context, projectId: 'other-brief' }, projectGuidelineBriefStatus);
  assert.doesNotMatch(other.brief, /QM verified/);
});

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

test('guideline brief status is scoped to the active project', async (t) => {
  t.mock.method(dataStore, 'readDataJSONOrDefault', async (_path, fallback) => fallback);
  const moneyHeist = await runWithProjectContext({
    projectId: 'money-heist-brief',
    source: 'header',
    projectGuidelines: 'Project Overview\nMoney Heist evaluates banking support trajectories.\n\nProject Workflow\nAudit the trajectory and build atomic rubrics.',
  }, () => projectGuidelineBriefStatus());
  const aurora = await runWithProjectContext({
    projectId: 'aurora-brief',
    source: 'header',
    projectGuidelines: 'Project Overview\nAurora evaluates astronomy research summaries.\n\nProject Workflow\nReview sources and publish a concise report.',
  }, () => projectGuidelineBriefStatus());

  assert.equal(moneyHeist.available, true);
  assert.match(moneyHeist.brief, /Money Heist/);
  assert.doesNotMatch(moneyHeist.brief, /Aurora/);
  assert.match(aurora.brief, /Aurora/);
  assert.ok(moneyHeist.estimatedTokens > 0);
  assert.ok(moneyHeist.sectionCount >= 2);
});
