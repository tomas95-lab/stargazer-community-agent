import '../server/load-env';
import { getActiveUserProject, projectKeyFromRow, getSupabaseAdmin, decryptSecret } from '../server/platform-store';
import { REDASH_OWNER_ID, redashRequest, normalizeRedashResult } from '../src/redash';
import { lookupEmails } from '../src/contributor-lookups';
import { platformGeminiApiKey, geminiRuntimeStatus } from '../src/ai-runtime';

async function main() {
  const username = process.argv[2];
  const emails = Object.values(lookupEmails(username));
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('No active configured project.');
  const projectId = projectKeyFromRow(project);
  if (!/^[a-f\d]{24}$/i.test(projectId)) throw new Error('Invalid configured project ID.');
  const prefix = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (!/^[a-z0-9_]+$/.test(prefix)) throw new Error('Invalid tag prefix.');
  const { data, error } = await getSupabaseAdmin().from('private_redash_connections').select('key_ciphertext').eq('owner_id', REDASH_OWNER_ID).single();
  if (error || !data) throw new Error('Redash connection unavailable.');
  const key = decryptSecret(data.key_ciphertext);
  const sql = `WITH identity AS (
    SELECT _id FROM PUBLIC.USERS WHERE LOWER(email) IN (${emails.map(email => `'${email}'`).join(',')}) AND COALESCE(__DELETED,FALSE)=FALSE
  ), person AS (SELECT _id FROM identity WHERE (SELECT COUNT(*) FROM identity)=1),
  permission AS (
    SELECT pe.DISABLED, pe.REVIEW_LEVEL FROM PUBLIC.TASKPERMISSIONENTRIES pe
    JOIN PUBLIC.PROJECTS p ON pe.PERMISSION_GROUP=p.PERMISSION_GROUP
    JOIN person u ON pe.WORKER=u._id
    WHERE p._id='${projectId}' AND COALESCE(pe.__DELETED,FALSE)=FALSE
    QUALIFY ROW_NUMBER() OVER(ORDER BY pe.UPDATED_AT DESC NULLS LAST)=1
  ), attempts AS (
    SELECT ta._id, ta.ATTEMPTED_AT, ta.ATTEMPTED_AT_REVIEW_LEVEL
    FROM FULL.TASKATTEMPTS ta JOIN person u ON ta.ATTEMPTED_BY=u._id
    WHERE ta.PROJECT='${projectId}' AND ta.ATTEMPTED_AT >= DATEADD('day',-365,CURRENT_TIMESTAMP())
  ), ratings AS (
    SELECT a._id, a.ATTEMPTED_AT_REVIEW_LEVEL, q.RESULT_NUMBER AS score, q.QMS_UPDATED_AT
    FROM attempts a JOIN VIEW.QMS_RATINGS q ON q.ATTEMPT_WORK_ID=a._id
    WHERE q.RESULT_NUMBER IS NOT NULL
    QUALIFY ROW_NUMBER() OVER(PARTITION BY a._id ORDER BY q.QMS_UPDATED_AT DESC)=1
  ), recent AS (
    SELECT * FROM ratings WHERE ATTEMPTED_AT_REVIEW_LEVEL=COALESCE((SELECT REVIEW_LEVEL FROM permission),-1)
    QUALIFY ROW_NUMBER() OVER(ORDER BY QMS_UPDATED_AT DESC,_id) <= IFF(COALESCE((SELECT REVIEW_LEVEL FROM permission),-1)>=0,2,3)
  ), queue AS (
    SELECT up.EMPTY_QUEUE_STATUS,up.IS_USER_QUALIFIED FROM PUBLIC.USERPROJECTPRIORITIES up
    JOIN person u ON up.USER_ID=u._id WHERE up.PROJECT_ID='${projectId}'
    QUALIFY ROW_NUMBER() OVER(ORDER BY up.LAST_MOVEMENT DESC NULLS LAST)=1
  ), throttle AS (
    SELECT t.START_TIME,t.EXPIRATION_TIME FROM VIEW.THROTTLED_WORKERS t JOIN person u ON t.USER_ID=u._id
    WHERE t.PROJECT_ID='${projectId}' AND t.THROTTLE_ENABLED=TRUE
    AND t.START_TIME<=CURRENT_TIMESTAMP() AND t.EXPIRATION_TIME>CURRENT_TIMESTAMP()
    QUALIFY ROW_NUMBER() OVER(ORDER BY t.EXPIRATION_TIME DESC)=1
  )
  SELECT CURRENT_TIMESTAMP() AS "observed_at", (SELECT COUNT(*) FROM identity) AS "identity_matches",
    (SELECT COUNT(*) FROM permission)>0 AS "permission_found",
    (SELECT DISABLED FROM permission) AS "disabled",(SELECT REVIEW_LEVEL FROM permission) AS "review_level",
    (SELECT ARRAY_AGG(LOWER(t.NAME)) FROM VIEW.USER_TAGS_LONG t JOIN person u ON t.USER_ID=u._id
      WHERE STARTSWITH(LOWER(t.NAME),'${prefix}_')) AS "tags",
    (SELECT EMPTY_QUEUE_STATUS FROM queue) AS "individual_eq", (SELECT IS_USER_QUALIFIED FROM queue) AS "qualified",
    (SELECT COUNT(*) FROM throttle)>0 AS "active_throttle",
    (SELECT START_TIME FROM throttle) AS "throttle_started_at",(SELECT EXPIRATION_TIME FROM throttle) AS "throttle_expires_at",
    (SELECT COUNT(*) FROM attempts) AS "total_attempts",
    (SELECT COUNT(*) FROM attempts WHERE ATTEMPTED_AT>=DATEADD('hour',-24,CURRENT_TIMESTAMP())) AS "submissions_last_24h",
    (SELECT MAX(ATTEMPTED_AT) FROM attempts) AS "last_submission_at",
    (SELECT COUNT(*) FROM recent) AS "recent_graded",
    (SELECT AVG(score) FROM ratings WHERE ATTEMPTED_AT_REVIEW_LEVEL=COALESCE((SELECT REVIEW_LEVEL FROM permission),-1)) AS "all_graded_qms",
    (SELECT ARRAY_AGG(OBJECT_CONSTRUCT('score',score,'qms_updated_at',QMS_UPDATED_AT)) WITHIN GROUP(ORDER BY QMS_UPDATED_AT DESC,_id) FROM ratings WHERE ATTEMPTED_AT_REVIEW_LEVEL=COALESCE((SELECT REVIEW_LEVEL FROM permission),-1)) AS "rating_history",
    (SELECT ARRAY_AGG(score) WITHIN GROUP(ORDER BY QMS_UPDATED_AT DESC,_id) FROM recent) AS "recent_scores",
    (SELECT AVG(score) FROM recent) AS "qms",(SELECT COUNT_IF(score<=2)/NULLIF(COUNT(*),0)::FLOAT FROM recent) AS "pdr",
    EXISTS(SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.PROJECT='${projectId}' AND h.STATUS='pending' AND h.WORKER IS NULL) AS "project_has_pending_tasks"
  FROM person`;
  let response = await redashRequest(key, 'query_results', { query: sql, data_source_id: 30, max_age: 0 });
  const deadline = Date.now()+120000;
  while (!response.query_result && response.job?.id && Date.now()<deadline) {
    const jobId = response.job.id;
    await new Promise(resolve => setTimeout(resolve,2000));
    const state = await redashRequest(key, `jobs/${encodeURIComponent(jobId)}`);
    if ([4,5].includes(state.job?.status)) {
      const message=String(state.job.error || 'Unknown SQL error').replace(/[a-f\d]{24}/gi,'[identifier]');
      throw new Error(`Unified query failed: ${message}`);
    }
    if (state.job?.status===3) response=await redashRequest(key,`query_results/${state.job.query_result_id}`);
  }
  if (!response.query_result) throw new Error('Unified query timed out.');
  const rows=normalizeRedashResult(response.query_result).rows;
  if(rows.length!==1 || rows[0].identity_matches!==1) throw new Error('Contributor identity not uniquely resolved.');
  console.log(JSON.stringify({project:project.project_name,username,evidence:rows[0],messagesSent:0},null,2));
  if(process.argv.includes('--query-only')) return;
  const model=geminiRuntimeStatus().model;
  const base=(process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/,'');
  const result=await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`,{
    method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':platformGeminiApiKey()},signal:AbortSignal.timeout(90000),
    body:JSON.stringify({contents:[{role:'user',parts:[{text:JSON.stringify({
      task:'Write an actual English contributor-facing draft answering I am EQ using the verified query evidence. Also return a Spanish qm_explanation explaining your decision. No query execution, no posting. Do not use the old generic-review response when a cause is confirmed. Scores, QMS, PDR and task limits may be communicated. Never claim an expected tier has already been applied. Do not invent missing facts. No signature or em dash.',
      project:project.project_name,message:'I am EQ',evidence:rows[0],
      rules:{attempterWindow:3,reviewerWindow:2,defect:'score 1 or 2',newAttempter:'one task then 24 hours throttle from submission',untrustedAttempter:'one task every 72 hours',normalAttempter:'one task every 24 hours',trustedAttempter:'six tasks every 24 hours',disabled:'disabled tag confirmed by QM means reassigned due to quality and cannot task',attempterGate:'fewer than 3 reviews: new; QMS<3 AND PDR>=one third AND no 4/5: disable; same with any 4/5: untrusted; QMS>=4 and PDR=0: promote; QMS>3 and PDR=0: trusted; QMS>=3 and PDR<=one third: normal',reviewerGate:'last 2: QMS<3.5 OR PDR>=0.5: demote; otherwise QMS<4 OR PDR>0: untrusted; QMS>=4 AND PDR=0: trusted',throttle:'Active throttle causes individual EQ. Use returned expiration if present; never invent a reset timestamp.',healthy:'If individual EQ false and no active throttle/access restriction: say no restriction seen and refresh.'}
    })}]}],generationConfig:{temperature:0,responseMimeType:'application/json',maxOutputTokens:2200}}),
  });
  if(!result.ok)throw new Error(`Gemini failed HTTP ${result.status}; no alternate model was used.`);
  const output=await result.json() as any;
  console.log(JSON.stringify({model,gemini:output.candidates?.[0]?.content?.parts?.map((part:any)=>part.text||'').join(''),messagesSent:0},null,2));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
