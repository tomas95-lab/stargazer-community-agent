import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const uiRequire = createRequire(new URL('../ui/package.json', import.meta.url));
const { createElement } = uiRequire('react');
const { renderToStaticMarkup } = uiRequire('react-dom/server');
const file = ts.createSourceFile('CommunityAgent.tsx', readFileSync(new URL('../ui/src/pages/CommunityAgent.tsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const components = file.statements.filter(node => ts.isFunctionDeclaration(node) && ['Badge', 'DecisionCard'].includes(node.name?.text));
const compiled = ts.transpileModule(`${components.map(node => node.getText(file)).join('\n')}\nexport { DecisionCard };`, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const exports = {};
new Function('require', 'exports', compiled)(uiRequire, exports);

test('pending diagnostic card does not present a placeholder acknowledgment or a zero-percent recommendation', () => {
  const markup = renderToStaticMarkup(createElement(exports.DecisionCard, { decision: {
    username: 'test-contributor', message: 'I am EQ', action: 'human', confidence: 0, diagnosticPending: true,
    reply: 'PLACEHOLDER_NOT_A_REAL_REPLY', reason: 'Diagnostic query is still running. Retry to continue the same query.',
  } }));
  assert.match(markup, /Diagnostic pending/);
  assert.match(markup, /Diagnostic query is still running/);
  assert.doesNotMatch(markup, /PLACEHOLDER_NOT_A_REAL_REPLY|Suggested acknowledgment|0%/);
});

test('resolved recommendations still display the real draft and confidence', () => {
  const markup = renderToStaticMarkup(createElement(exports.DecisionCard, { decision: {
    username: 'test-contributor', message: 'Are tasks back?', action: 'reply', confidence: 1,
    reply: 'The project currently has no tasks.', reason: 'Verified project availability.',
  } }));
  assert.match(markup, /Draft reply/);
  assert.match(markup, /100%/);
  assert.match(markup, /The project currently has no tasks/);
});
