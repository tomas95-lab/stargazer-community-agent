import { Octokit } from '@octokit/rest';

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  return new Octokit({ auth: token });
}

function getRepo(): { owner: string; repo: string } {
  return {
    owner: process.env.GITHUB_OWNER || 'tomasruiz653',
    repo: process.env.GITHUB_REPO || 'community_bot',
  };
}

export async function readJSON<T>(filePath: string): Promise<{ data: T; sha: string }> {
  const octokit = getOctokit();
  const { owner, repo } = getRepo();

  const response = await octokit.repos.getContent({ owner, repo, path: filePath });
  const file = response.data as { content: string; sha: string };
  const content = Buffer.from(file.content, 'base64').toString('utf-8');
  return { data: JSON.parse(content) as T, sha: file.sha };
}

export async function writeJSON<T>(filePath: string, data: T, message: string): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo } = getRepo();

  let sha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({ owner, repo, path: filePath });
    sha = (existing.data as { sha: string }).sha;
  } catch {
    sha = undefined;
  }

  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64');

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message,
    content,
    sha,
  });
}

export async function listDirectory(dirPath: string): Promise<Array<{ name: string; sha: string; size: number }>> {
  const octokit = getOctokit();
  const { owner, repo } = getRepo();

  try {
    const response = await octokit.repos.getContent({ owner, repo, path: dirPath });
    const items = response.data as Array<{ name: string; sha: string; size: number; type: string }>;
    return items.filter((i) => i.type === 'file').map(({ name, sha, size }) => ({ name, sha, size }));
  } catch {
    return [];
  }
}

export async function readFile(filePath: string): Promise<string> {
  const octokit = getOctokit();
  const { owner, repo } = getRepo();

  const response = await octokit.repos.getContent({ owner, repo, path: filePath });
  const file = response.data as { content: string };
  return Buffer.from(file.content, 'base64').toString('utf-8');
}
