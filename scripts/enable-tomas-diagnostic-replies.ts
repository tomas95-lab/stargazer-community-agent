import '../server/load-env';
import { getActiveUserProject, projectKeyFromRow, getSupabaseAdmin } from '../server/platform-store';
import { REDASH_OWNER_ID, canUseRedash } from '../src/redash';
import type { DiagnosticQuery } from '../src/redash-diagnostics';

async function main() {
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled || !canUseRedash({id:project.owner_id,email:project.owner_email,isDemo:project.settings?.demoMode===true})) {
    throw new Error('An active Tomas-owned connection is required. No settings changed.');
  }
  const projectId = projectKeyFromRow(project);
  const db = getSupabaseAdmin();
  const {data,error} = await db.from('private_redash_connections').select('queries').eq('owner_id',REDASH_OWNER_ID).single();
  if(error || !data)throw new Error('Diagnostic configuration unavailable.');
  const original=data.queries as DiagnosticQuery[];
  const matches=original.filter(query=>query.diagnosticRole==='unified' && query.diagnosticVersion===3 && query.diagnosticProjectId===projectId);
  if(matches.length!==1)throw new Error('Exactly one verified unified binding is required.');
  const queries=original.map(query=>query.id===matches[0].id ? {...query,diagnosticEnabled:true,diagnosticAutoReply:true}:query);
  const saved=await db.from('private_redash_connections').update({queries,updated_at:new Date().toISOString()})
    .eq('owner_id',REDASH_OWNER_ID).eq('queries',JSON.stringify(original)).select('owner_id');
  if(saved.error || saved.data?.length!==1)throw new Error('Configuration changed concurrently or could not be saved.');
  const check=await db.from('private_redash_connections').select('queries').eq('owner_id',REDASH_OWNER_ID).single();
  const active=(check.data?.queries as DiagnosticQuery[]|undefined)?.find(query=>query.id===matches[0].id);
  if(check.error || !active?.diagnosticEnabled || !active?.diagnosticAutoReply)throw new Error('Enablement verification failed.');
  console.log(JSON.stringify({project:project.project_name,owner:'Tomas Ruiz',query:active.queryId,diagnosticsEnabled:true,
    diagnosticAutoReply:true,otherAccountsChanged:false,projectAutomationSettingsChanged:false,
    communityAutoPost:project.settings?.autoPost ?? project.auto_reply_enabled,
    dmAutoReply:project.settings?.dmAutoReply ?? 'uses existing scheduler configuration',messagesSent:0}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
