import test from 'node:test';
import assert from 'node:assert/strict';
import { projectKeyForDataPath } from '../dist/supabase-data-store.js';
import { activeDataStore } from '../dist/data-store.js';

test('Supabase data paths resolve explicit project folders', () => {
  assert.equal(projectKeyForDataPath('data/projects/alpha-project/topics.json'), 'alpha-project');
  assert.equal(projectKeyForDataPath('output/projects/beta-project/operations.json'), 'beta-project');
});

test('Supabase legacy data paths use the active project fallback', () => {
  assert.equal(projectKeyForDataPath('data/topics.json', '69cd3d3788bf65e1468428b1'), '69cd3d3788bf65e1468428b1');
});

test('Supabase data paths reject traversal', () => {
  assert.throws(() => projectKeyForDataPath('data/projects/alpha-project/../secret.txt'), /Invalid data path/);
  assert.throws(() => projectKeyForDataPath('data/projects/alpha_project/%/secret.txt'), /Invalid data path/);
});

test('the new storage backend setting overrides the legacy data store setting', () => {
  const previousBackend = process.env.STORAGE_BACKEND;
  const previousLegacy = process.env.DATA_STORE;
  try {
    process.env.STORAGE_BACKEND = 'supabase';
    process.env.DATA_STORE = 'github';
    assert.equal(activeDataStore(), 'supabase');
  } finally {
    if (previousBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = previousBackend;
    if (previousLegacy === undefined) delete process.env.DATA_STORE;
    else process.env.DATA_STORE = previousLegacy;
  }
});
