import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './paths';
import {
  listDirectory as listGitHubDirectory,
  readFile as readGitHubFile,
  readJSON as readGitHubJSON,
  writeFile as writeGitHubFile,
  writeJSON as writeGitHubJSON,
} from './github-storage';
import { projectScopedDataPath } from './project-context';

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

function scopedPath(filePath: string): string {
  return projectScopedDataPath(filePath);
}

function resolveLocalPath(filePath: string): string {
  const root = path.resolve(PATHS.root);
  const target = path.resolve(PATHS.root, scopedPath(filePath));
  const normalizedRoot = root.toLowerCase();
  const normalizedTarget = target.toLowerCase();

  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Invalid data path: ${filePath}`);
  }

  return target;
}

export async function readDataJSON<T>(filePath: string): Promise<T> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'github') {
    const { data } = await readGitHubJSON<T>(pathInStore);
    return data;
  }

  const raw = await fs.readFile(resolveLocalPath(filePath), 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeDataJSON<T>(filePath: string, data: T, message: string): Promise<void> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'github') {
    await writeGitHubJSON(pathInStore, data, message);
    return;
  }

  const target = resolveLocalPath(filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export async function readDataText(filePath: string): Promise<string> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'github') {
    return readGitHubFile(pathInStore);
  }

  return fs.readFile(resolveLocalPath(filePath), 'utf-8');
}

export async function writeDataText(filePath: string, text: string, message: string): Promise<void> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'github') {
    await writeGitHubFile(pathInStore, text.endsWith('\n') ? text : `${text}\n`, message);
    return;
  }

  const target = resolveLocalPath(filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

export async function listDataDirectory(dirPath: string): Promise<DataFileInfo[]> {
  const pathInStore = scopedPath(dirPath);
  if (activeDataStore() === 'github') {
    const files = await listGitHubDirectory(pathInStore);
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
