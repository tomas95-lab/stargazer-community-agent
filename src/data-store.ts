import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './config';
import {
  listDirectory as listGitHubDirectory,
  readFile as readGitHubFile,
  readJSON as readGitHubJSON,
  writeJSON as writeGitHubJSON,
} from './github-storage';

export type DataStoreMode = 'github' | 'local';

export interface DataFileInfo {
  name: string;
  size: number;
  modified: string;
}

function requestedMode(): string {
  return (process.env.DATA_STORE || 'auto').trim().toLowerCase();
}

export function activeDataStore(): DataStoreMode {
  const requested = requestedMode();
  if (requested === 'github') return 'github';
  if (requested === 'local') return 'local';
  return process.env.GITHUB_TOKEN ? 'github' : 'local';
}

export function dataStoreSummary(): { requested: string; active: DataStoreMode } {
  return { requested: requestedMode(), active: activeDataStore() };
}

function resolveLocalPath(filePath: string): string {
  const root = path.resolve(PATHS.root);
  const target = path.resolve(PATHS.root, filePath);
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Invalid data path: ${filePath}`);
  }

  return target;
}

export async function readDataJSON<T>(filePath: string): Promise<T> {
  if (activeDataStore() === 'github') {
    const { data } = await readGitHubJSON<T>(filePath);
    return data;
  }

  const raw = await fs.readFile(resolveLocalPath(filePath), 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeDataJSON<T>(filePath: string, data: T, message: string): Promise<void> {
  if (activeDataStore() === 'github') {
    await writeGitHubJSON(filePath, data, message);
    return;
  }

  const target = resolveLocalPath(filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function readDataText(filePath: string): Promise<string> {
  if (activeDataStore() === 'github') {
    return readGitHubFile(filePath);
  }

  return fs.readFile(resolveLocalPath(filePath), 'utf-8');
}

export async function listDataDirectory(dirPath: string): Promise<DataFileInfo[]> {
  if (activeDataStore() === 'github') {
    const files = await listGitHubDirectory(dirPath);
    return files.map((file) => ({ ...file, modified: '' }));
  }

  const dir = resolveLocalPath(dirPath);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const stat = await fs.stat(path.join(dir, entry.name));
        return {
          name: entry.name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      })
  );

  return files;
}
