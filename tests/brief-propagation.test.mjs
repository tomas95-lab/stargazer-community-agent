import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runWithProjectContext, getCurrentProjectId } from '../dist/project-context.js';
import { generateComposedMessage } from '../dist/message-composer.js';
import { evaluateSupportMessage } from '../dist/community-agent.js';
import { unifiedAccountDraft } from '../dist/unified-account-draft.js';
const require=createRequire(import.meta.url);

test('Community/DM support, Composer and Redash generation all obey the same persisted brief switch',async t=>{
  const data=require('../dist/data-store.js');
  let enabled=true;
  t.mock.method(data,'readDataJSONOrDefault',async(file,fallback)=>file==='data/guideline-brief.json'
    ? {brief:'BRIEF_SENTINEL Read the project guidelines',enabled}:fallback);
  const guidelines=require('../dist/project-guidelines.js');
  t.mock.method(guidelines,'findProjectGuidelineSnippets',async()=>['ORIGINAL_GUIDELINE atomic rubric criteria.']);
  t.mock.method(guidelines,'findGuidelineSnippetsForChannel',async()=>['ORIGINAL_GUIDELINE atomic rubric criteria.']);
  const memory=require('../dist/project-memory.js');
  t.mock.method(memory,'relevantProjectMemoryText',async()=> 'QM_MEMORY verified project information.');
  t.mock.method(memory,'findApprovedMemoryAnswer',async()=>null);
  t.mock.method(require('../dist/links.js'),'loadProjectLinks',async()=>({}));
  t.mock.method(require('../dist/operations-log.js'),'appendOperationLog',async()=>{});
  const usage=require('../dist/usage-guardrails.js');
  t.mock.method(usage,'assertAiUsageAllowed',async()=>undefined);
  t.mock.method(usage,'recordAiUsage',async()=>undefined);
  const prompts=[];
  t.mock.method(require('../dist/ai-runtime.js'),'generateAiText',async request=>{
    prompts.push({project:getCurrentProjectId(),prompt:request.prompt});
    assert.match(request.prompt,/ORIGINAL_GUIDELINE/);
    assert.match(request.prompt,/QM_MEMORY/);
    assert.equal(request.prompt.includes('BRIEF_SENTINEL'),enabled);
    return {model:'gemini-test',text:JSON.stringify({
      action:'reply',confidence:1,reply:'Use atomic criteria.',reason:'Supported by original guidelines.',
      qm_reason:'Confirmed source.',variants:[{message:'Use atomic criteria.',warnings:[]}],
    })};
  });
  for(const flag of [true,false]) {
    enabled=flag;
    await runWithProjectContext({projectId:'brief-all-flows',source:'header'},async()=>{
      await generateComposedMessage({prompt:'Explain rubric criteria.'});
      // DM evaluation invokes this same support evaluator.
      await evaluateSupportMessage('contributor','Explain rubric criteria.','','',false,'123');
      await unifiedAccountDraft({diagnosis:'active_throttle'},'Test','I am EQ');
    });
  }
  assert.equal(prompts.length,6);
});
