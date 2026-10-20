import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function mountedApiRouters(file) {
  const source=ts.createSourceFile(file,readFileSync(new URL(file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
  const routes=new Map();
  function visit(node) {
    if(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.expression.getText(source)==='app' && node.expression.name.text==='use') {
      const [path,router]=node.arguments;
      if(path && ts.isStringLiteral(path) && path.text.startsWith('/api/')
        && router && ts.isIdentifier(router) && router.text.endsWith('Router')) routes.set(path.text,router.text);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);
  return routes;
}

test('Vercel registers every API router available in the local server, including Redash',()=>{
  const local=mountedApiRouters('../server/app.ts');
  const production=mountedApiRouters('../api/index.ts');
  assert.equal(local.get('/api/redash'),'redashRouter');
  for(const [path,router] of local) assert.equal(production.get(path),router,`Missing production router: ${path}`);
});
