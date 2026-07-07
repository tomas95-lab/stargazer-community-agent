import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProjectMemory } from '../dist/project-memory.js';

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
