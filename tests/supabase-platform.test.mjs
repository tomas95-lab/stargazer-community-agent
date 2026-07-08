import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePlatformProjectInput } from '../dist/supabase-platform.js';

test('platform project input trims and normalizes valid data', () => {
  const result = normalizePlatformProjectInput({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: '  Stargazer Axiom  ',
    categoryId: '  15895  ',
    categorySlug: '  stargazer-axiom  ',
    channelId: '  828853  ',
    projectGuidelines: '  Step 0: ask for Cursor access.  ',
    discourseApiKey: '  discourse-key  ',
    enabled: true,
  });

  assert.equal(result.id, '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(result.name, 'Stargazer Axiom');
  assert.equal(result.categoryId, '15895');
  assert.equal(result.categorySlug, 'stargazer-axiom');
  assert.equal(result.channelId, '828853');
  assert.equal(result.projectGuidelines, 'Step 0: ask for Cursor access.');
  assert.equal(result.discourseApiKey, 'discourse-key');
  assert.equal(result.enabled, true);
});

test('platform project input defaults name and enabled state', () => {
  const result = normalizePlatformProjectInput({
    categoryId: '15895',
    categorySlug: 'stargazer-axiom',
    channelId: '828853',
    projectGuidelines: 'Guidelines',
  });

  assert.equal(result.name, 'Community Project');
  assert.equal(result.enabled, true);
});

test('platform project input rejects missing required fields', () => {
  assert.throws(
    () => normalizePlatformProjectInput({
      name: 'Stargazer',
      categoryId: '',
      categorySlug: 'stargazer-axiom',
      channelId: '828853',
      projectGuidelines: 'Guidelines',
    }),
    /Category ID is required/
  );
});

test('platform project input rejects invalid project ids', () => {
  assert.throws(
    () => normalizePlatformProjectInput({
      id: '../not-a-uuid',
      name: 'Stargazer',
      categoryId: '15895',
      categorySlug: 'stargazer-axiom',
      channelId: '828853',
      projectGuidelines: 'Guidelines',
    }),
    /Invalid project id/
  );
});
