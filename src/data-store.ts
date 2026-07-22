import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './paths';
import {
  listDirectory as listGitHubDirectory,
  deletePath as deleteGitHubPath,
  readFile as readGitHubFile,
  readJSON as readGitHubJSON,
  writeFile as writeGitHubFile,
  writeJSON as writeGitHubJSON,
} from './github-storage';
import { getProjectContext, projectScopedDataPath } from './project-context';
import {
  DataFileNotFoundError,
  deleteSupabaseDataPath,
  listSupabaseDataDirectory,
  projectKeyForDataPath,
  readSupabaseDataFile,
  supabaseDataStoreConfigured,
  writeSupabaseDataFile,
} from './supabase-data-store';

export type DataStoreMode = 'supabase' | 'github' | 'local';

export interface DataFileInfo {
  name: string;
  size: number;
  modified: string;
}

function requestedMode(): string {
  return (process.env.STORAGE_BACKEND || process.env.DATA_STORE || 'auto').trim().toLowerCase();
}

export function activeDataStore(): DataStoreMode {
  const requested = requestedMode();
  const platformProject = Boolean(getProjectContext().ownerId);
  if (platformProject && supabaseDataStoreConfigured()) return 'supabase';
  if (requested === 'supabase') return 'supabase';
  if (requested === 'github') return 'github';
  if (requested === 'local') return 'local';
  if (supabaseDataStoreConfigured()) return 'supabase';
  return process.env.GITHUB_TOKEN ? 'github' : 'local';
}

export function dataStoreSummary(): { requested: string; active: DataStoreMode } {
  return { requested: requestedMode(), active: activeDataStore() };
}

function scopedPath(filePath: string): string {
  return projectScopedDataPath(filePath);
}

function fallbackMode(): Exclude<DataStoreMode, 'supabase'> | null {
  const requested = (process.env.STORAGE_FALLBACK || process.env.DATA_STORE_FALLBACK || '').trim().toLowerCase();
  if (requested === 'github' && process.env.GITHUB_TOKEN) return 'github';
  if (requested === 'local') return 'local';
  return null;
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
  const store = activeDataStore();
  if (store === 'supabase') {
    try {
      const file = await readSupabaseDataFile(pathInStore, projectKeyForDataPath(pathInStore));
      return JSON.parse(file.content) as T;
    } catch (err) {
      const fallback = fallbackMode();
      if (!fallback || !(err instanceof DataFileNotFoundError)) throw err;
      const data = await readJSONFrom<T>(fallback, filePath, pathInStore);
      await writeSupabaseDataFile(pathInStore, JSON.stringify(data, null, 2) + '\n', 'json', 'lazy migration from fallback');
      return data;
    }
  }
  return readJSONFrom<T>(store, filePath, pathInStore);
}

async function readJSONFrom<T>(mode: Exclude<DataStoreMode, 'supabase'>, filePath: string, pathInStore: string): Promise<T> {
  if (mode === 'github') {
    const { data } = await readGitHubJSON<T>(pathInStore);
    return data;
  }

  const raw = await fs.readFile(resolveLocalPath(filePath), 'utf-8');
  return JSON.parse(raw) as T;
}

export async function writeDataJSON<T>(filePath: string, data: T, message: string): Promise<void> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'supabase') {
    await writeSupabaseDataFile(pathInStore, JSON.stringify(data, null, 2) + '\n', 'json', message);
    return;
  }
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
  if (activeDataStore() === 'supabase') {
    try {
      return (await readSupabaseDataFile(pathInStore, projectKeyForDataPath(pathInStore))).content;
    } catch (err) {
      const fallback = fallbackMode();
      if (!fallback || !(err instanceof DataFileNotFoundError)) throw err;
      const content = fallback === 'github'
        ? await readGitHubFile(pathInStore)
        : await fs.readFile(resolveLocalPath(filePath), 'utf-8');
      await writeSupabaseDataFile(pathInStore, content, 'text', 'lazy migration from fallback');
      return content;
    }
  }
  if (activeDataStore() === 'github') {
    return readGitHubFile(pathInStore);
  }

  return fs.readFile(resolveLocalPath(filePath), 'utf-8');
}

export async function writeDataText(filePath: string, text: string, message: string): Promise<void> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'supabase') {
    await writeSupabaseDataFile(pathInStore, text.endsWith('\n') ? text : `${text}\n`, 'text', message);
    return;
  }
  if (activeDataStore() === 'github') {
    await writeGitHubFile(pathInStore, text.endsWith('\n') ? text : `${text}\n`, message);
    return;
  }

  const target = resolveLocalPath(filePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, text.endsWith('\n') ? text : `${text}\n`, 'utf-8');
}

export async function deleteDataPath(filePath: string, message: string): Promise<void> {
  const pathInStore = scopedPath(filePath);
  if (activeDataStore() === 'supabase') {
    await deleteSupabaseDataPath(pathInStore, projectKeyForDataPath(pathInStore));
    return;
  }
  if (activeDataStore() === 'github') {
    await deleteGitHubPath(pathInStore, message);
    return;
  }

  await fs.rm(resolveLocalPath(filePath), { recursive: true, force: true });
}

export async function listDataDirectory(dirPath: string): Promise<DataFileInfo[]> {
  const pathInStore = scopedPath(dirPath);
  if (activeDataStore() === 'supabase') {
    const files = await listSupabaseDataDirectory(pathInStore, projectKeyForDataPath(pathInStore));
    return files.map((file) => ({
      name: file.path.split('/').pop() || file.path,
      size: file.size,
      modified: file.updatedAt,
    }));
  }
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
