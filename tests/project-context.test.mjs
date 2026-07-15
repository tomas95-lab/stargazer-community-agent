import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalProjectId,
  projectScopedDataPath,
  runWithProjectContext,
} from '../dist/project-context.js';

test('real Stargazer project id keeps legacy shared data paths', () => {
  assert.equal(projectScopedDataPath('data/topics.json', '69cd3d3788bf65e1468428b1'), 'data/topics.json');
  assert.equal(projectScopedDataPath('data/project-guidelines.txt', '69cd3d3788bf65e1468428b1'), 'data/project-guidelines.txt');
});

test('legacy stargazer alias resolves to the real project id', () => {
  assert.equal(canonicalProjectId('stargazer'), '69cd3d3788bf65e1468428b1');
  assert.equal(projectScopedDataPath('data/topics.json', 'stargazer'), 'data/topics.json');
  assert.equal(projectScopedDataPath('data/project-guidelines.txt', 'stargazer'), 'data/project-guidelines.txt');
});

test('non-legacy project id scopes shared data paths by project id', () => {
  assert.equal(projectScopedDataPath('data/topics.json', 'alpha-project'), 'data/projects/alpha-project/topics.json');
  assert.equal(projectScopedDataPath('data/comms-templates.json', 'alpha-project'), 'data/projects/alpha-project/comms-templates.json');
  assert.equal(projectScopedDataPath('output/state.json', 'alpha-project'), 'output/projects/alpha-project/state.json');
});

test('runtime project context scopes data paths while active', () => {
  const scoped = runWithProjectContext({ projectId: 'beta-project', source: 'header' }, () =>
    projectScopedDataPath('data/links.json')
  );

  assert.equal(scoped, 'data/projects/beta-project/links.json');
});
