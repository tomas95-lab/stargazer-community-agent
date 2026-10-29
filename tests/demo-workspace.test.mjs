import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { demoDiagnosticPreview, demoDiagnosticProfiles } from '../dist/demo-diagnostics.js';
import { getQualityMetrics } from '../dist/quality-metrics.js';
import { runWithProjectContext } from '../dist/project-context.js';
const require = createRequire(import.meta.url);
require('tsx/cjs');

test('demo UI shows Diagnostics from trusted auth metadata but never enables real Redash', () => {
  const { canUseDiagnostics, canUseRedash, isDemoDiagnosticsUser } = require('../ui/src/lib/redash-access.ts');
  const demo = { id:'demo-user', app_metadata:{demo_account:true} };
  assert.equal(isDemoDiagnosticsUser(demo),true);
  assert.equal(canUseDiagnostics(demo),true);
  assert.equal(canUseRedash(demo),false);
  assert.equal(canUseDiagnostics({id:'other',user_metadata:{demo_account:true}}),false);
  assert.equal(canUseDiagnostics(null),false);
});

test('demo Quality has consistent fictional data for every selectable window without storage or AI access', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Demo must not make network calls'); });
  for (const days of [14,30,60]) {
    const metrics = await runWithProjectContext({ projectId: 'outlier-community-demo', source: 'header', demoMode: true }, () => getQualityMetrics(days));
    assert.equal(metrics.simulated, true);
    assert.equal(metrics.windowDays, days);
    assert.equal(metrics.daily.length, days);
    assert.ok(metrics.daily.every(day => day.messages > 0 && day.replies > 0));
    assert.equal(metrics.totals.messages, metrics.daily.reduce((sum, day) => sum + day.messages, 0));
    assert.equal(metrics.totals.replies, metrics.daily.reduce((sum, day) => sum + day.replies, 0));
    assert.ok(metrics.rates.responseRate > 0 && metrics.rates.responseRate <= 100);
    assert.ok(metrics.rates.resolutionRate > 0 && metrics.rates.resolutionRate <= 100);
    assert.equal(metrics.totals.aiTokensToday, 0);
  }
});

test('all demo profiles return synthetic evidence and drafts without any external calls', t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Demo must not make network calls'); });
  const profiles = demoDiagnosticProfiles();
  assert.equal(profiles.length,8);
  for (const profile of profiles) {
    const result = demoDiagnosticPreview(profile.username,'I am EQ');
    assert.equal(result.simulated,true);
    assert.equal(result.draft.draftOnly,true);
    assert.equal(result.draft.action,'human');
    assert.equal(result.evidence.contributor,profile.username);
    assert.doesNotMatch(JSON.stringify(result), /redash\.scale|latam\.coder|money_heist|sk-ant|api_key|ciphertext/);
  }
  assert.match(demoDiagnosticPreview('alex.demo','I am EQ').draft.reply,/1 task every 24 hours/);
  assert.match(demoDiagnosticPreview('marco.demo','I am EQ').draft.reply,/1 task every 72 hours/);
  assert.match(demoDiagnosticPreview('sofia.demo','I am EQ').draft.reply,/6 tasks every 24 hours/);
  assert.match(demoDiagnosticPreview('jordan.demo','I am EQ').draft.reply,/average score: 2.5/);
  assert.match(demoDiagnosticPreview('sam.demo','I am EQ').draft.reply,/Aurora is currently EQ/);
  assert.match(demoDiagnosticPreview('riley.demo','I am EQ').draft.reply,/refresh/);
  assert.match(demoDiagnosticPreview('jordan.demo','Could I have another chance?').draft.reply,/cannot authorize/);
  assert.match(demoDiagnosticPreview('alex.demo','What is my score?').draft.reply,/overall average score is 3.5/);
  assert.throws(()=>demoDiagnosticPreview('latam.coder779','I am EQ'),/fictional contributor/);
});

test('demo diagnostics routes require both authenticated demo metadata and demo project; real endpoints stay inaccessible', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('No real storage or provider access permitted'); });
  let user = null;
  const { createDemoDiagnosticsRouter } = require('../server/routes/demo-diagnostics.ts');
  const router = createDemoDiagnosticsRouter(async () => user);
  const request = (method,url,body, demoMode=true) => require('../src/project-context.ts').runWithProjectContext({ projectId:'outlier-community-demo',source:'header',demoMode }, () => new Promise((resolve,reject)=>{
    const res = { statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){resolve({code:this.statusCode,body});} };
    router.handle({method,url,body,headers:{}},res,()=>reject(new Error('Demo route bypass')));
  }));
  assert.equal((await request('GET','/')).code,401);
  user = { id:'ordinary-qm',email:'qm@example.com' };
  assert.equal((await request('GET','/')).code,403);
  user = { id:'demo-user',email:'testing@demo.local',isDemo:true };
  assert.equal((await request('GET','/',undefined,false)).code,403);
  assert.equal((await request('GET','/')).body.profiles.length,8);
  const preview = await request('POST','/preview',{username:'sofia.demo',message:'I am EQ'});
  assert.equal(preview.code,200);
  assert.equal(preview.body.simulated,true);
  assert.equal((await request('POST','/preview',{username:'latam.coder779',message:'I am EQ'})).code,400);
  assert.equal((await request('POST','/preview',{username:'alex.demo',message:''})).code,400);
  for (const path of ['/connection','/queries','/availability/check','/jobs/real']) assert.equal((await request('POST',path,{})).code,404);
  const realRouter = require('../server/routes/redash.ts').createRedashRouter(async()=>user);
  const denied=await new Promise(resolve=>realRouter.handle({method:'GET',url:'/',headers:{}},{status(code){this.code=code;return this;},json(body){resolve({code:this.code,body});}},()=>assert.fail('Demo reached real Redash')));
  assert.equal(denied.code,403);
});
