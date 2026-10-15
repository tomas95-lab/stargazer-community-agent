import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { authorizeDiagnosticReply } from '../dist/redash-diagnostics.js';
import { sealDiagnosticDraft } from '../dist/diagnostic-disclosure.js';
import { runWithProjectContext } from '../dist/project-context.js';
import { REDASH_OWNER_ID } from '../dist/redash.js';
const require = createRequire(import.meta.url);
const project = '6a96fa0eeb622ed112e30794';
const context = {projectId: project, source:'header', ownerId:REDASH_OWNER_ID, redashDiagnosticsAllowed:true};
const resolved = () => sealDiagnosticDraft({diagnosticVersion:3,diagnosticResolved:true,
  reply:'You reached your limit of one task per twenty-four hours.',reason:'Throttle activo confirmado.'});

function storage(t, queries) {
  const oldKey=process.env.PLATFORM_ENCRYPTION_KEY;
  process.env.PLATFORM_ENCRYPTION_KEY='test-auto-diagnostics';
  t.after(()=>{if(oldKey===undefined)delete process.env.PLATFORM_ENCRYPTION_KEY;else process.env.PLATFORM_ENCRYPTION_KEY=oldKey;});
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(process.env.PLATFORM_ENCRYPTION_KEY).digest(),iv);
  const encrypted=Buffer.concat([cipher.update('fake-key'),cipher.final()]);
  const key_ciphertext=`enc:v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDb',()=>({from:()=>({select:()=>({eq:(_field,id)=>{
    assert.equal(id,REDASH_OWNER_ID);
    return {maybeSingle:async()=>({data:{key_ciphertext,queries}})};
  }})})}));
}
const binding = {diagnosticRole:'unified',diagnosticVersion:3,diagnosticProjectId:project,diagnosticEnabled:true,diagnosticAutoReply:true};

test('only Tomas-owned authorized context with explicit project opt-in promotes a confirmed diagnostic', async t => {
  storage(t,[binding]);
  const result=await runWithProjectContext(context,()=>authorizeDiagnosticReply(resolved()));
  assert.equal(result.action,'reply');
  assert.equal(result.draftOnly,false);
  assert.equal(result.confidence,1);
});

test('other QM, admin-token context, demo and paused project never promote diagnostics',async t=>{
  t.mock.method(require('../dist/runtime-db.js'),'runtimeDb',()=>{throw new Error('Must not reach storage');});
  for(const override of [{ownerId:'other-qm'},{redashDiagnosticsAllowed:false},{demoMode:true},{automationPaused:true}]) {
    const result=await runWithProjectContext({...context,...override},()=>authorizeDiagnosticReply(resolved()));
    assert.equal(result.action,'human');
    assert.equal(result.draftOnly,true);
  }
});

test('missing or wrong-project opt-in remains draft only',async t=>{
  const queries=[];
  storage(t,queries);
  for(const bindingOverride of [{diagnosticAutoReply:false},{diagnosticEnabled:false},{diagnosticProjectId:'other'},{diagnosticVersion:2}]) {
    queries.splice(0,queries.length,{...binding,...bindingOverride});
    const result=await runWithProjectContext(context,()=>authorizeDiagnosticReply(resolved()));
    assert.equal(result.draftOnly,true);
  }
});

test('unresolved, invalid and preview diagnostic objects remain human drafts even with opt-in',async t=>{
  storage(t,[binding]);
  const value=resolved();
  assert.equal(value.action,'human'); // Preview routes only seal; they never authorize sending.
  for(const candidate of [{...value,diagnosticResolved:false},{reply:'Unapproved',reason:'Anything'},
    {...value,reply:'Email private@example.com'}]) {
    const result=await runWithProjectContext(context,()=>authorizeDiagnosticReply(candidate));
    assert.equal(result.action,'human');
    assert.equal(result.draftOnly,true);
  }
});

test('support evaluator carries the authorized decision into Community and DM reply workflows', async t=>{
  storage(t,[binding]);
  t.mock.method(require('../dist/redash-diagnostics.js'),'accountDiagnosticDraft',async()=>resolved());
  const {evaluateSupportMessage}=require('../dist/community-agent.js');
  const result=await runWithProjectContext(context,()=>evaluateSupportMessage('latam.coder779','I am EQ','','',false));
  assert.equal(result.action,'reply');
  assert.equal(result.draftOnly,false);
  const another=await runWithProjectContext({...context,ownerId:'other-qm',redashDiagnosticsAllowed:false},()=>evaluateSupportMessage('latam.coder779','I am EQ','','',false));
  assert.equal(another.action,'human');
});
