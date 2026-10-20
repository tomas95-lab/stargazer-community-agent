import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv,createHash,randomBytes } from 'node:crypto';
import { startAccountDiagnostic,pollAccountDiagnostic,diagnosticWaitMs,authorizeDiagnosticReply,accountDiagnosticDraft,activeProjectDiagnosticConnection } from '../dist/redash-diagnostics.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { sealDiagnosticDraft,DIAGNOSTIC_COPY } from '../dist/diagnostic-disclosure.js';
import { REDASH_OWNER_ID } from '../dist/redash.js';
const require=createRequire(import.meta.url);
const project='6a96fa0eeb622ed112e30794';
const context={projectId:project,source:'header',ownerId:REDASH_OWNER_ID,redashDiagnosticsAllowed:true};

function setup(t) {
  const old=process.env.PLATFORM_ENCRYPTION_KEY;
  process.env.PLATFORM_ENCRYPTION_KEY='pending-test-only';
  t.after(()=>{if(old===undefined)delete process.env.PLATFORM_ENCRYPTION_KEY;else process.env.PLATFORM_ENCRYPTION_KEY=old;});
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(process.env.PLATFORM_ENCRYPTION_KEY).digest(),iv);
  const bytes=Buffer.concat([cipher.update('fake-key'),cipher.final()]);
  const key_ciphertext=`enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${bytes.toString('base64url')}`;
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDbConfigured',()=>true);
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDb',()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{key_ciphertext,queries:[{
    queryId:33,diagnosticVersion:3,diagnosticRole:'unified',diagnosticProjectId:project,diagnosticEnabled:true,diagnosticAutoReply:true,
  }]}})})})})}));
  const store=new Map();
  t.mock.method(require('../dist/data-store.js'),'readDataJSONOrDefault',async(path,fallback)=>store.get(path) ?? fallback);
  t.mock.method(require('../dist/data-store.js'),'writeDataJSON',async(path,value)=>{store.set(path,value);});
  return store;
}

test('project availability credentials require Tomas and the enabled project-bound automatic query',async t=>{
  setup(t);
  assert.deepEqual(await runWithProjectContext(context,activeProjectDiagnosticConnection),{key:'fake-key',queryId:33});
  for(const overrides of [{ownerId:'another-qm'},{redashDiagnosticsAllowed:false},{demoMode:true},{automationPaused:true}]) {
    assert.equal(await runWithProjectContext({...context,...overrides},activeProjectDiagnosticConnection),null);
  }
  assert.equal(await runWithProjectContext({...context,projectId:'another-project'},activeProjectDiagnosticConnection),null);
});

test('pending Redash job is encrypted and resumed on retries, without restarting the SQL',async t=>{
  const store=setup(t);
  let starts=0;
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path,body)=>{
    assert.equal(path,'queries/33/results');
    assert.equal(body.max_age,60);
    starts++;
    return {job:{id:'pending-job'}};
  });
  const first=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','I am EQ'));
  assert.equal(first.task.jobId,'pending-job');
  assert.doesNotMatch(JSON.stringify([...store.values()]),/latam.coder1669|pending-job|I am EQ|fake-key/);
  const second=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','Please remove my throttle'));
  assert.equal(starts,1);
  assert.equal(second.task.jobId,'pending-job');
  assert.equal(second.task.message,'Please remove my throttle');
  await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder779','I am EQ'));
  assert.equal(starts,2);
});

test('a saved job survives the ninety-minute cron interval without extending expired preview tokens', async t => {
  setup(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let starts = 0;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async () => { starts++; return { job: { id: 'original-job' } }; });
  const first = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  t.mock.timers.tick(90 * 60000);
  await assert.rejects(runWithProjectContext(context, () => pollAccountDiagnostic(first.task)), /expired/);
  const resumed = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  assert.equal(resumed.task.jobId, 'original-job');
  assert.equal(starts, 1);
  assert.ok(resumed.task.expires > Date.now());
  t.mock.timers.tick(3 * 60 * 60000);
  await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  assert.equal(starts, 2, 'Job retention must remain bounded');
});

test('legacy five-minute persisted jobs can be recovered by the server without accepting the expired client token', async t => {
  const store = setup(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let starts = 0;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async () => { starts++; return { job: { id: 'legacy-job' } }; });
  const first = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  const legacy = { ...first.task };
  delete legacy.createdAt;
  delete legacy.resumeUntil;
  delete legacy.preview;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(process.env.PLATFORM_ENCRYPTION_KEY).digest(), iv);
  const bytes = Buffer.concat([cipher.update(JSON.stringify(legacy)), cipher.final()]);
  store.set([...store.keys()][0], { ciphertext: `enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${bytes.toString('base64url')}` });
  t.mock.timers.tick(90 * 60000);
  await assert.rejects(runWithProjectContext(context, () => pollAccountDiagnostic(legacy)), /expired/);
  const resumed = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  assert.equal(resumed.task.jobId, 'legacy-job');
  assert.equal(starts, 1);
});

test('revoking the bound query prevents a pending job from reaching Redash or the model', async t => {
  setup(t);
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async () => ({ job: { id: 'pending-job' } }));
  const first = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  const db = require('../dist/runtime-db.js');
  const { data } = await db.runtimeDb().from().select().eq().maybeSingle();
  data.queries[0].diagnosticEnabled = false;
  t.mock.method(db, 'runtimeDb', () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data }) }) }) }) }));
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async () => assert.fail('Revoked query reached Redash'));
  const result = await runWithProjectContext(context, () => pollAccountDiagnostic(first.task));
  assert.match(result.draft.reason, /no longer enabled/);
  assert.equal(result.draft.diagnosticPending, undefined);
  assert.equal(result.draft.diagnosticResolved, undefined);
});

test('an AI outage preserves the completed job so retrying does not rerun SQL', async t => {
  const store = setup(t);
  let starts = 0;
  let generations = 0;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path) => {
    if (path === 'queries/33/results') { starts++; return { job: { id: 'done-job' } }; }
    if (path === 'jobs/done-job') return { job: { status: 3, query_result_id: 44 } };
    assert.equal(path, 'query_results/44');
    return { query_result: { retrieved_at: new Date().toISOString(), data: { columns: [], rows: [{
      project_id: project, contributor_id: 'a'.repeat(24), identity_matches: 1, project_has_tasks: false,
    }] } } };
  });
  t.mock.method(require('../dist/unified-account-draft.js'), 'unifiedAccountDraft', async () => {
    if (++generations === 1) throw new Error('Gemini temporarily unavailable');
    return sealDiagnosticDraft({ diagnosticVersion: 3, diagnosticResolved: true, reply: DIAGNOSTIC_COPY.empty, reason: 'Verified project availability.' });
  });
  const first = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  const pending = await runWithProjectContext(context, () => pollAccountDiagnostic(first.task));
  assert.equal(pending.draft.diagnosticPending, true);
  assert.ok([...store.values()][0]?.ciphertext);
  const retry = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  const result = await runWithProjectContext(context, () => pollAccountDiagnostic(retry.task));
  assert.equal(result.draft.diagnosticResolved, true);
  assert.equal(starts, 1);
  assert.equal(generations, 2);
  assert.equal([...store.values()][0], null);
});

test('a completed but stale job is refreshed once, never sent to the model as current evidence', async t => {
  setup(t);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const old = new Date().toISOString();
  let starts = 0;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path, body) => {
    if (path === 'queries/33/results') {
      starts++;
      if (starts === 2) assert.equal(body.max_age, 0);
      return { job: { id: starts === 1 ? 'old-job' : 'fresh-job' } };
    }
    if (path === 'jobs/old-job') return { job: { status: 3, query_result_id: 44 } };
    assert.equal(path, 'query_results/44');
    return { query_result: { retrieved_at: old, data: { columns: [], rows: [{
      project_id: project, contributor_id: 'a'.repeat(24), identity_matches: 1, project_has_tasks: false,
    }] } } };
  });
  t.mock.method(require('../dist/unified-account-draft.js'), 'unifiedAccountDraft', async () => assert.fail('Stale evidence reached the model'));
  await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  t.mock.timers.tick(90 * 60000);
  const resumed = await runWithProjectContext(context, () => startAccountDiagnostic('latam.coder1669', 'I am EQ'));
  const refreshed = await runWithProjectContext(context, () => pollAccountDiagnostic(resumed.task));
  assert.equal(refreshed.task.jobId, 'fresh-job');
  assert.equal(starts, 2);
});

test('the exact tasks-back question uses project SQL, not contributor performance SQL', async t => {
  setup(t);
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path, body) => {
    if (path === 'queries/33') return { data_source_id: 30 };
    assert.equal(path, 'query_results');
    assert.doesNotMatch(body.query, /TASKATTEMPTS|PUBLIC\.USERS|USERTHROTTLES/);
    assert.match(body.query, /review_level IN \(-1, 0\)/);
    return { job: { id: 'project-only' } };
  });
  const result = await runWithProjectContext(context, () => startAccountDiagnostic('pilots-coder668', "Hey Tomas, are the tasks back? I'm on EQ over here."));
  assert.equal(result.task.scope, 'project');
});

test('semantic selection can execute the bound query without any recognized status phrase',async t=>{
  setup(t);
  let selections=0;
  t.mock.method(require('../dist/diagnostic-routing.js'),'selectDiagnosticQuery',async(message,conversation)=>{
    selections++;
    assert.equal(message,'Ya termine lo que me asignaron para empezar?');
    assert.equal(conversation,'Previous: course onboarding.');
    return 'contributor';
  });
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path,body)=>{
    assert.equal(path,'queries/33/results');
    assert.equal(body.parameters.project_id,project);
    assert.equal(body.parameters.email_primary,'latam.coder1669@remotasks.com+outlier');
    assert.equal(Object.hasOwn(body,'query'),false);
    return{job:{id:'semantic-job'}};
  });
  const result=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669',
    'Ya termine lo que me asignaron para empezar?',false,'Previous: course onboarding.'));
  assert.equal(result.task.jobId,'semantic-job');
  assert.equal(selections,1);
});

test('pilots usernames reach the unified query without inventing another contributor identity',async t=>{
  setup(t);
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path,body)=>{
    assert.equal(path,'queries/33/results');
    assert.ok(Object.values(body.parameters).filter(value=>String(value).includes('@'))
      .every(email=>email.startsWith('pilots-coder668@')));
    return{job:{id:'pilots-job'}};
  });
  const result=await runWithProjectContext(context,()=>startAccountDiagnostic('pilots-coder668',
    'I am EQ. Is my account throttled?'));
  assert.equal(result.task.jobId,'pilots-job');
});

test('transient lookup failures remain retryable after sealing and never become resolved replies',async t=>{
  setup(t);
  t.mock.method(require('../dist/redash.js'),'redashRequest',async()=>{throw new Error('Temporarily unreachable');});
  const result=await runWithProjectContext(context,()=>startAccountDiagnostic('pilots-coder668','I am EQ'));
  const safe=sealDiagnosticDraft(result.draft);
  assert.equal(safe.diagnosticPending,true);
  assert.match(safe.reason,/lookup unavailable/);
  assert.equal((await runWithProjectContext(context,()=>authorizeDiagnosticReply(safe))).action,'human');
});

test('Community retries technical diagnostic failures instead of marking the question processed',async t=>{
  setup(t);
  const data=require('../dist/data-store.js');
  let saved;
  t.mock.method(data,'readDataJSON',async()=>({processed:{}}));
  t.mock.method(data,'writeDataJSON',async(path,value)=>{if(path.endsWith('community-agent-state.json'))saved=structuredClone(value);});
  t.mock.method(require('../dist/links.js'),'loadProjectLinks',async()=>({warRoom:''}));
  t.mock.method(require('../dist/operations-log.js'),'appendOperationLog',async()=>undefined);
  t.mock.method(require('../dist/discourse-client.js').DiscourseClient.prototype,'readChatMessages',async()=>[{
    id:668,message:"Hey Tomas, are the tasks back? I'm on EQ over here.",created_at:new Date().toISOString(),user:{username:'pilots-coder668'},
  }]);
  t.mock.method(require('../dist/redash-diagnostics.js'),'accountDiagnosticDraft',async()=>sealDiagnosticDraft({
    reply:DIAGNOSTIC_COPY.review,reason:'Diagnostic lookup unavailable.',diagnosticPending:true,
  }));
  const config={communityBaseUrl:'https://community.example',communityChatChannelId:'123',discourseApiKey:'fake-key',
    discourseApiClientId:'test',discourseUsername:'manager'};
  const run=()=>runWithProjectContext({...context,botConfig:config},()=>require('../dist/community-agent.js')
    .runCommunityAgent({post:false,react:false,onlyToday:false,markProcessed:true}));
  assert.equal((await run()).decisions[0].diagnosticPending,true);
  assert.deepEqual(saved.processed,{});
  assert.equal((await run()).candidates,1);
});

test('negative selection and unauthorized contexts cannot execute Redash queries',async t=>{
  setup(t);
  let selections=0;
  t.mock.method(require('../dist/diagnostic-routing.js'),'selectDiagnosticQuery',async()=>{selections++;return null;});
  t.mock.method(require('../dist/redash.js'),'redashRequest',async()=>{throw new Error('Query must not execute');});
  assert.equal(await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','Thank you!')),null);
  assert.equal(selections,1);
  for(const overrides of [{redashDiagnosticsAllowed:false},{demoMode:true}]) {
    assert.equal(await runWithProjectContext({...context,...overrides},()=>startAccountDiagnostic('latam.coder1669','Can I continue?')),null);
  }
  assert.equal(selections,1);
});

test('sandbox project question uses only project availability even if the username cannot resolve',async t=>{
  setup(t);
  t.mock.method(require('../dist/diagnostic-routing.js'),'selectDiagnosticQuery',async()=> 'project');
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path,body)=>{
    if(path==='queries/33') return{data_source_id:30};
    assert.equal(path,'query_results');
    assert.match(body.query,/review_level IN \(-1, 0\)/);
    assert.ok(body.query.includes(project));
    assert.doesNotMatch(body.query,/latam\.coder|PUBLIC\.USERS|USERPROJECTPRIORITIES/);
    return{query_result:{data:{columns:[],rows:[{project_id:project,project_has_tasks:false}]}}};
  });
  t.mock.method(require('../dist/unified-account-draft.js'),'unifiedAccountDraft',async(row,_project,message,_conversation,scope)=>{
    assert.equal(scope,'project');
    assert.equal(row.identity_matches,undefined);
    assert.equal(message,'There are task in the project?');
    return sealDiagnosticDraft({diagnosticVersion:3,diagnosticResolved:true,
      reply:'The project is currently EQ.',reason:'No hay tareas disponibles en L-1/L0.'});
  });
  for(const username of ['latam.coder93','sandbox.user']) {
    const result=await runWithProjectContext(context,()=>startAccountDiagnostic(username,'There are task in the project?'));
    assert.equal(result.draft.reply,'The project is currently EQ.');
  }
});

test('project queries reject wrong-project results and never bypass personal identity checks',async t=>{
  setup(t);
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path)=>path==='queries/33'
    ? {data_source_id:30} : {query_result:{data:{columns:[],rows:[{project_id:'other-project',project_has_tasks:false}]}}});
  const result=await runWithProjectContext(context,()=>startAccountDiagnostic('sandbox.user','Does the project have tasks?'));
  assert.equal(result.draft.diagnosticResolved,undefined);
  assert.match(result.draft.reason,/availability was not returned/);
  const personal=await runWithProjectContext(context,()=>startAccountDiagnostic('sandbox.user','I am EQ'));
  assert.match(personal.draft.reason,/username is not supported/);
});

test('project and contributor pending jobs have separate scope-bound storage',async t=>{
  const store=setup(t);
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path)=> {
    if(path==='queries/33') return{data_source_id:30};
    return{job:{id:path==='query_results'?'project-job':'person-job'}};
  });
  const projectRun=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder93','Does the project have tasks?'));
  const personal=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder93','I am EQ'));
  assert.equal(projectRun.task.scope,'project');
  assert.equal(personal.task.scope,'contributor');
  assert.equal(projectRun.task.jobId,'project-job');
  assert.equal(personal.task.jobId,'person-job');
  assert.equal(store.size,2);
});

test('failed jobs are cleared and can start fresh; unauthorized callers cannot access pending state',async t=>{
  const store=setup(t);
  let starts=0;
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path)=>{
    if(path==='queries/33/results'){starts++;return{job:{id:'failed-job'}};}
    return{job:{status:4}};
  });
  const first=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','I am EQ'));
  const failed=await runWithProjectContext(context,()=>pollAccountDiagnostic(first.task));
  assert.match(failed.draft.reason,/query failed/);
  assert.equal([...store.values()][0],null);
  await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','I am EQ'));
  assert.equal(starts,2);
  assert.equal(await runWithProjectContext({...context,redashDiagnosticsAllowed:false},()=>startAccountDiagnostic('latam.coder1669','I am EQ')),null);
});

test('pending status survives sealing and can never be sent automatically',async()=>{
  const pending=sealDiagnosticDraft({reply:DIAGNOSTIC_COPY.review,reason:'Diagnostic query is still running. Retry to continue the same query.',diagnosticPending:true});
  assert.equal(sealDiagnosticDraft(pending).diagnosticPending,true);
  const decision=await runWithProjectContext(context,()=>authorizeDiagnosticReply(pending));
  assert.equal(decision.draftOnly,true);
  assert.equal(decision.action,'human');
  const contradictory = sealDiagnosticDraft({ diagnosticVersion: 3, diagnosticPending: true, diagnosticResolved: true,
    reply: DIAGNOSTIC_COPY.empty, reason: 'Still pending.' });
  assert.equal((await runWithProjectContext(context, () => authorizeDiagnosticReply(contradictory))).action, 'human');
});

test('pending diagnostics are not treated as human escalation or knowledge gaps',async t=>{
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDbConfigured',()=>false);
  t.mock.method(require('../dist/data-store.js'),'readDataJSON',async()=>({items:{}}));
  const entries=[{id:'pending-community',action:'community_agent',at:new Date().toISOString()},
    {id:'pending-dm',action:'dm_auto_reply',at:new Date().toISOString()}];
  const logs=require('../dist/operations-log.js');
  t.mock.method(logs,'readOperationLog',async()=>entries);
  t.mock.method(logs,'readOperationDetails',async()=>new Map(entries.map(entry=>[entry.id,{
    decisions:[{action:'human',needsHuman:false,diagnosticPending:true,username:'contributor',reason:'Query still running'}],
  }])));
  const {getReviewQueue}=require('../dist/review-queue.js');
  const result=await runWithProjectContext(context,()=>getReviewQueue());
  assert.equal(result.items.length,0);
});

test('wait budget defaults to ninety seconds and is configurable within bounds',t=>{
  const old=process.env.REDASH_DIAGNOSTIC_WAIT_MS;
  t.after(()=>{if(old===undefined)delete process.env.REDASH_DIAGNOSTIC_WAIT_MS;else process.env.REDASH_DIAGNOSTIC_WAIT_MS=old;});
  delete process.env.REDASH_DIAGNOSTIC_WAIT_MS;
  assert.equal(diagnosticWaitMs(),90000);
  for(const[value,expected]of[['60000',60000],['1',1000],['999999',120000],['invalid',90000]]){
    process.env.REDASH_DIAGNOSTIC_WAIT_MS=value;
    assert.equal(diagnosticWaitMs(),expected);
  }
});

test('a query taking seventy-seven seconds resolves in the same evaluation with bounded backoff polling', async t => {
  setup(t);
  const old = process.env.REDASH_DIAGNOSTIC_WAIT_MS;
  delete process.env.REDASH_DIAGNOSTIC_WAIT_MS;
  t.after(() => { if (old !== undefined) process.env.REDASH_DIAGNOSTIC_WAIT_MS = old; });
  const started = Date.now();
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: started });
  let starts = 0;
  let polls = 0;
  t.mock.method(require('../dist/redash.js'), 'redashRequest', async (_key, path) => {
    if (path === 'queries/33/results') { starts++; return { job: { id: 'slow-but-valid' } }; }
    if (path === 'jobs/slow-but-valid') {
      polls++;
      return { job: Date.now() - started >= 76700 ? { status: 3, query_result_id: 44 } : { status: 2 } };
    }
    assert.equal(path, 'query_results/44');
    return { query_result: { retrieved_at: new Date().toISOString(), data: { columns: [], rows: [{
      project_id: project, contributor_id: 'a'.repeat(24), identity_matches: 1, project_has_tasks: false,
    }] } } };
  });
  t.mock.method(require('../dist/unified-account-draft.js'), 'unifiedAccountDraft', async () => sealDiagnosticDraft({
    diagnosticVersion: 3, diagnosticResolved: true, reply: DIAGNOSTIC_COPY.empty, reason: 'Verified current project availability.',
  }));
  const promise = runWithProjectContext(context, () => accountDiagnosticDraft('latam.coder1669', 'I am EQ'));
  for (let i = 0; i < 10; i++) {
    await new Promise(setImmediate);
    t.mock.timers.tick(8000);
  }
  const result = await promise;
  assert.equal(result.diagnosticResolved, true);
  assert.equal(starts, 1);
  assert.ok(polls <= 15, `Expected bounded backoff polling, got ${polls}`);
});

test('exhausting the wait budget keeps the job resumable rather than reporting terminal timeout',async t=>{
  const store=setup(t);
  const old=process.env.REDASH_DIAGNOSTIC_WAIT_MS;
  process.env.REDASH_DIAGNOSTIC_WAIT_MS='1000';
  t.after(()=>{if(old===undefined)delete process.env.REDASH_DIAGNOSTIC_WAIT_MS;else process.env.REDASH_DIAGNOSTIC_WAIT_MS=old;});
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
  let starts=0;
  t.mock.method(require('../dist/redash.js'),'redashRequest',async(_key,path)=>{
    if(path==='queries/33/results'){starts++;return{job:{id:'slow-job'}};}
    return{job:{status:2}};
  });
  const promise=runWithProjectContext(context,()=>accountDiagnosticDraft('latam.coder1669','I am EQ'));
  await new Promise(resolve=>setImmediate(resolve));
  t.mock.timers.tick(1200);
  const result=await promise;
  assert.equal(result.diagnosticPending,true);
  assert.match(result.reason,/still running/);
  assert.doesNotMatch(result.reason,/timeout/i);
  assert.equal(result.draftOnly,true);
  assert.ok([...store.values()][0].ciphertext);
  const resumed=await runWithProjectContext(context,()=>startAccountDiagnostic('latam.coder1669','Please remove the throttle'));
  assert.equal(resumed.task.jobId,'slow-job');
  assert.equal(starts,1);
});
