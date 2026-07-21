import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { LEGACY_PROJECT_ID } from './project-context';

interface LegacyOperation {
  id: string;
  at: string;
  action: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
  metadata?: Record<string, unknown>;
}

interface GitHubTreeItem {
  path?: string;
  type?: string;
}

function env(name: string): string {
  return process.env[name]?.trim() || '';
}

function required(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const githubOwner = required('GITHUB_OWNER');
const githubRepo = required('GITHUB_REPO');
const githubToken = required('GITHUB_TOKEN');
const githubBranch = env('GITHUB_BRANCH') || 'main';
const supabase = createClient(required('SUPABASE_URL'), env('SUPABASE_SECRET_KEY') || required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function githubRequest(path: string, accept: string): Promise<Response> {
  const response = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: accept,
      'User-Agent': 'daily-thread-bot-operational-migration',
    },
  });
  if (!response.ok) throw new Error(`GitHub request failed for ${path} (${response.status}).`);
  return response;
}

async function readJson<T>(path: string): Promise<T> {
  const response = await githubRequest(`contents/${path}?ref=${encodeURIComponent(githubBranch)}`, 'application/vnd.github.raw+json');
  return JSON.parse(await response.text()) as T;
}

function projectKeyForLog(path: string): string {
  if (path === 'output/operations-log.json') return LEGACY_PROJECT_ID;
  return path.match(/^output\/projects\/([^/]+)\/operations-log\.json$/)?.[1] || '';
}

function detailPathFor(logPath: string, operationId: string): string {
  return logPath.replace(/operations-log\.json$/, `operation-details/${operationId}.json`);
}

function validOperation(value: LegacyOperation): boolean {
  return /^[a-f0-9-]{16,80}$/i.test(value.id)
    && Number.isFinite(Date.parse(value.at))
    && ['success', 'error', 'skipped'].includes(value.status)
    && Boolean(value.action);
}

async function run(): Promise<void> {
  const [{ data: projects, error: projectsError }, treeResponse] = await Promise.all([
    supabase.from('qm_projects').select('project_key'),
    githubRequest(`git/trees/${encodeURIComponent(githubBranch)}?recursive=1`, 'application/vnd.github+json'),
  ]);
  if (projectsError) throw new Error(projectsError.message);

  const projectKeys = new Set((projects || []).map((project) => project.project_key));
  const tree = await treeResponse.json() as { tree?: GitHubTreeItem[] };
  const filePaths = new Set((tree.tree || []).filter((item) => item.type === 'blob' && item.path).map((item) => item.path as string));
  const logPaths = [...filePaths]
    .filter((path) => path === 'output/operations-log.json' || /^output\/projects\/[^/]+\/operations-log\.json$/.test(path))
    .filter((path) => projectKeys.has(projectKeyForLog(path)));

  let discovered = 0;
  let imported = 0;
  for (const logPath of logPaths) {
    const projectKey = projectKeyForLog(logPath);
    const operations = (await readJson<LegacyOperation[]>(logPath)).filter(validOperation);
    discovered += operations.length;
    const rows = [];

    for (const operation of operations) {
      const detailPath = detailPathFor(logPath, operation.id);
      let detail: unknown = null;
      if (filePaths.has(detailPath)) {
        const record = await readJson<{ detail?: unknown }>(detailPath);
        detail = record.detail ?? null;
      }
      rows.push({
        id: operation.id,
        project_key: projectKey,
        owner_id: null,
        action: operation.action,
        status: operation.status,
        message: operation.message || '',
        metadata: operation.metadata || {},
        detail,
        created_at: operation.at,
      });
    }

    for (let index = 0; index < rows.length; index += 100) {
      const batch = rows.slice(index, index + 100);
      const { error } = await supabase.from('automation_events').upsert(batch, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error(error.message);
      imported += batch.length;
    }
    console.log(`${projectKey}: processed ${operations.length} historical operations.`);
  }

  console.log(`Operational history migration complete: ${imported}/${discovered} records processed.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
