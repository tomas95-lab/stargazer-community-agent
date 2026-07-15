interface GitHubContentFile {
  type: 'file';
  content: string;
  sha: string;
  size: number;
  name: string;
}

interface GitHubContentDirectoryItem {
  type: 'file' | 'dir' | string;
  name: string;
  sha: string;
  size: number;
}

class GitHubApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`GitHub API error ${status}: ${body.slice(0, 500)}`);
    this.name = 'GitHubApiError';
    this.status = status;
    this.body = body;
  }
}

function getRepo(): { owner: string; repo: string } {
  return {
    owner: process.env.GITHUB_OWNER || 'tomas95-lab',
    repo: process.env.GITHUB_REPO || 'stargazer-community-agent',
  };
}

function getToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not set');
  return token;
}

function encodePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

async function githubRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GitHubApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

function contentPath(filePath: string): string {
  const { owner, repo } = getRepo();
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodePath(filePath)}`;
}

export async function readJSON<T>(filePath: string): Promise<{ data: T; sha: string }> {
  const file = await githubRequest<GitHubContentFile>(contentPath(filePath));
  const content = Buffer.from(file.content, 'base64').toString('utf-8');
  return { data: JSON.parse(content) as T, sha: file.sha };
}

async function currentSha(filePath: string): Promise<string | undefined> {
  try {
    const existing = await githubRequest<GitHubContentFile>(contentPath(filePath));
    return existing.sha;
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 404) return undefined;
    throw err;
  }
}

async function writeContent(filePath: string, content: string, message: string): Promise<void> {
  let sha = await currentSha(filePath);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await githubRequest(contentPath(filePath), {
        method: 'PUT',
        body: JSON.stringify({
          message,
          content,
          sha,
        }),
      });
      return;
    } catch (err) {
      if (!(err instanceof GitHubApiError) || err.status !== 409 || attempt === 2) {
        throw err;
      }

      sha = await currentSha(filePath);
    }
  }
}

export async function writeJSON<T>(filePath: string, data: T, message: string): Promise<void> {
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n').toString('base64');
  await writeContent(filePath, content, message);
}

export async function writeFile(filePath: string, text: string, message: string): Promise<void> {
  const content = Buffer.from(text).toString('base64');
  await writeContent(filePath, content, message);
}

export async function listDirectory(dirPath: string): Promise<Array<{ name: string; sha: string; size: number }>> {
  try {
    const items = await githubRequest<GitHubContentDirectoryItem[]>(contentPath(dirPath));
    return items.filter((item) => item.type === 'file').map(({ name, sha, size }) => ({ name, sha, size }));
  } catch {
    return [];
  }
}

export async function readFile(filePath: string): Promise<string> {
  const file = await githubRequest<GitHubContentFile>(contentPath(filePath));
  return Buffer.from(file.content, 'base64').toString('utf-8');
}
