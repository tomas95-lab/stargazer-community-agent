import '../server/load-env';
import { getActiveUserProject, projectRuntimeContextForRow } from '../server/platform-store';
import { runWithProjectContext } from '../src/project-context';
import { activeProjectDiagnosticConnection } from '../src/redash-diagnostics';
import { REDASH_OWNER_ID, normalizeRedashResult, redashRequest } from '../src/redash';
import { PROJECT_AVAILABILITY_SQL } from '../src/project-availability-job';

async function main() {
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('An active project is required.');
  const context = await projectRuntimeContextForRow(project);
  await runWithProjectContext(context, async () => {
    const connection = await activeProjectDiagnosticConnection();
    if (!connection) throw new Error('Project diagnostics are not enabled.');
    if (!/^[a-f\d]{24}$/i.test(context.projectId)) throw new Error('Invalid configured project.');
    const definition = await redashRequest(connection.key, `queries/${connection.queryId}`);
    if (definition.data_source_id !== 30) throw new Error('Unexpected diagnostic database.');
    const layers = process.argv.includes('--layers');
    const sql = layers ? `SELECT p._id AS "project_id", CURRENT_TIMESTAMP() AS "observed_at",
      EXISTS (SELECT 1 FROM PUBLIC.PIPELINEV3HUMANNODES h WHERE h.project=p._id
        AND h.status='pending' AND h.worker IS NULL AND h.review_level=-1) AS "attempter_has_tasks",
      (SELECT ARRAY_AGG(DISTINCT h.review_level) FROM PUBLIC.PIPELINEV3HUMANNODES h
        WHERE h.project=p._id AND h.status='pending' AND h.worker IS NULL
          AND h.review_level IN (-1, 0)) AS "pending_layers"
      FROM PUBLIC.PROJECTS p WHERE p._id='{{project_id}}' AND COALESCE(p.__deleted,FALSE)=FALSE`
      : PROJECT_AVAILABILITY_SQL;
    let result = await redashRequest(connection.key, 'query_results', {
      query: sql.replace('{{project_id}}', context.projectId), data_source_id: 30, max_age: 0,
    });
    const deadline = Date.now() + 90000;
    const jobId = result.job?.id;
    while (!result.query_result && jobId && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const job = await redashRequest(connection.key, `jobs/${encodeURIComponent(jobId)}`);
      if ([4, 5].includes(job.job?.status)) throw new Error('Availability SQL validation failed.');
      if (job.job?.status === 3) result = await redashRequest(connection.key, `query_results/${job.job.query_result_id}`);
    }
    if (!result.query_result) throw new Error('Availability SQL is still pending. No messages sent.');
    const rows = normalizeRedashResult(result.query_result).rows;
    if (rows.length !== 1 || rows[0].project_id !== context.projectId
      || typeof rows[0][layers ? 'attempter_has_tasks' : 'project_has_tasks'] !== 'boolean') {
      throw new Error('Project availability result is invalid.');
    }
    console.log(JSON.stringify({ project: project.project_name, diagnosticsEnabled: true,
      ...(layers ? { attempterHasTasks: rows[0].attempter_has_tasks, pendingLayers: rows[0].pending_layers }
        : { projectHasTasks: rows[0].project_has_tasks }),
      observedAt: rows[0].observed_at, messagesSent: 0, aiCalls: 0 }));
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
