import test from 'node:test';
import assert from 'node:assert/strict';
import { findApprovedMemoryAnswer, normalizeProjectMemory, relevantProjectMemoryText } from '../dist/project-memory.js';
import { runWithProjectContext } from '../dist/project-context.js';

test('project memory normalizes useful facts and drops empty rows', () => {
  const result = normalizeProjectMemory({
    updatedAt: '2026-07-07T12:00:00.000Z',
    facts: [
      { id: ' War Room Hours ', title: ' War Room ', body: ' Open weekdays. ', source: ' ops ' },
      { id: 'empty', title: '', body: 'missing title' },
    ],
  });

  assert.equal(result.updatedAt, '2026-07-07T12:00:00.000Z');
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].id, 'war-room-hours');
  assert.equal(result.facts[0].title, 'War Room');
  assert.equal(result.facts[0].body, 'Open weekdays.');
  assert.equal(result.facts[0].source, 'ops');
});

test('project memory falls back to default facts when input is empty', () => {
  const result = normalizeProjectMemory({ facts: [] });

  assert.ok(result.facts.length >= 1);
  assert.ok(result.facts.some((fact) => fact.id === 'war-room-hours'));
});

test('project memory sends only facts relevant to the current question', async () => {
  const context = {
    projectId: 'memory-retrieval-test',
    source: 'header',
    projectMemoryFacts: [
      { id: 'payments', title: 'Payment policy', body: 'Payment questions require human review.' },
      { id: 'rubrics', title: 'Rubric rules', body: 'Each rubric criterion must be atomic.' },
    ],
  };
  const result = await runWithProjectContext(context, () => relevantProjectMemoryText('How do I write an atomic rubric?', 3));

  assert.match(result, /Rubric rules/);
  assert.doesNotMatch(result, /Payment policy/);
});

test('approved direct answers require an explicit phrase match', async () => {
  const context = {
    projectId: 'memory-faq-test',
    source: 'header',
    projectMemoryFacts: [{
      id: 'guide-link',
      title: 'Guideline location',
      body: 'Open the Guidelines tab in the project workspace.',
      directAnswer: true,
      matchPhrases: ['where are the guidelines', 'guideline location'],
    }],
  };
  const matched = await runWithProjectContext(context, () => findApprovedMemoryAnswer('Where are the guidelines?'));
  const unrelated = await runWithProjectContext(context, () => findApprovedMemoryAnswer('How should I write a rubric?'));
  const partial = await runWithProjectContext({
    ...context,
    projectMemoryFacts: [{
      id: 'task-location',
      title: 'Task location',
      body: 'Open the task queue.',
      directAnswer: true,
      matchPhrases: ['task'],
    }],
  }, () => findApprovedMemoryAnswer('Why is tasking unavailable?'));

  assert.equal(matched?.id, 'guide-link');
  assert.equal(unrelated, null);
  assert.equal(partial, null);
});
