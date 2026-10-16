import '../server/load-env';
import { getActiveUserProject, projectRuntimeContextForRow } from '../server/platform-store';
import { runWithProjectContext } from '../src/project-context';
import { evaluateSupportMessage } from '../src/community-agent';
import { REDASH_OWNER_ID } from '../src/redash';
import { DiscourseClient } from '../src/discourse-client';

async function main() {
  const project = await getActiveUserProject(REDASH_OWNER_ID);
  if (!project?.enabled) throw new Error('No active configured project.');
  const context = await projectRuntimeContextForRow(project);
  // Exercise real Redash and AI evaluation, but prohibit outgoing chat writes.
  DiscourseClient.prototype.sendChatMessage = async () => { throw new Error('Test forbids message posting.'); };
  const message = 'There are task in the project?';
  const decision = await runWithProjectContext(context, () => evaluateSupportMessage(
    'latam.coder93', message, 'Sandbox evaluation only. Do not post.', '', false));
  console.log(JSON.stringify({ project: project.project_name, message,
    reply: decision.reply, reason: decision.reason, action: decision.action, messagesSent: 0 }, null, 2));
  if (!('diagnosticResolved' in decision) || decision.diagnosticResolved !== true) {
    throw new Error('Project availability did not produce a resolved diagnostic.');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
