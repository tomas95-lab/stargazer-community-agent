import test from 'node:test';
import assert from 'node:assert/strict';
import { projectKeyForDataPath } from '../dist/supabase-data-store.js';
import { activeDataStore } from '../dist/data-store.js';
import { runWithProjectContext } from '../dist/project-context.js';

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

test('authenticated platform projects use Supabase despite a legacy GitHub setting', () => {
  const previous = {
    backend: process.env.STORAGE_BACKEND,
    legacy: process.env.DATA_STORE,
    url: process.env.SUPABASE_URL,
    secret: process.env.SUPABASE_SECRET_KEY,
  };
  try {
    delete process.env.STORAGE_BACKEND;
    process.env.DATA_STORE = 'github';
    process.env.SUPABASE_URL = 'https://demo.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'demo-secret';
    const store = runWithProjectContext(
      { projectId: 'demo-project', ownerId: 'demo-user', source: 'header' },
      () => activeDataStore(),
    );
    assert.equal(store, 'supabase');
  } finally {
    const restore = (key, value) => value === undefined ? delete process.env[key] : process.env[key] = value;
    restore('STORAGE_BACKEND', previous.backend);
    restore('DATA_STORE', previous.legacy);
    restore('SUPABASE_URL', previous.url);
    restore('SUPABASE_SECRET_KEY', previous.secret);
  }
});
