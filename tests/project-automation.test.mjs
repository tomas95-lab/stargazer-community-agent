import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProjectAutomationActive,
  projectScheduleAllowsNow,
  runWithProjectContext,
} from '../dist/project-context.js';
import { normalizeTimeZone } from '../dist/time-zone.js';

test('paused project blocks publishing actions', () => {
  assert.throws(
    () => runWithProjectContext({ projectId: 'testing-project', source: 'header', automationPaused: true }, () => assertProjectAutomationActive()),
    /project is paused/i,
  );
});

test('project schedule applies timezone, weekday, and time window', () => {
  const context = {
    projectId: 'testing-project',
    source: 'header',
    automationSettings: {
      timezone: 'America/Los_Angeles',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
    },
  };

  assert.equal(runWithProjectContext(context, () => projectScheduleAllowsNow(new Date('2026-07-20T19:00:00Z'))), true);
  assert.equal(runWithProjectContext(context, () => projectScheduleAllowsNow(new Date('2026-07-20T03:00:00Z'))), false);
  assert.equal(runWithProjectContext(context, () => projectScheduleAllowsNow(new Date('2026-07-19T19:00:00Z'))), false);
});

test('normalizes timezone names containing spaces', () => {
  assert.equal(normalizeTimeZone('America/Costa Rica'), 'America/Costa_Rica');
  assert.equal(normalizeTimeZone('America/Costa_Rica'), 'America/Costa_Rica');
});

test('invalid project timezone falls back without crashing the schedule', () => {
  const context = {
    projectId: 'testing-project',
    source: 'header',
    automationSettings: {
      timezone: 'Not/A_Timezone',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '00:00',
      endTime: '23:59',
    },
  };

  assert.doesNotThrow(() => runWithProjectContext(context, () => projectScheduleAllowsNow(new Date('2026-07-20T19:00:00Z'))));
});
