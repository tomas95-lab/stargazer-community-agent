import 'dotenv/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { listRepositoryFiles as listGitHubFiles, readFile as readGitHubFile } from './github-storage';
import { PATHS } from './paths';
import {
  assertSupabaseDataStoreReady,
  DataFileNotFoundError,
  projectKeyForDataPath,
  readSupabaseDataFile,
  supabaseDataStoreConfigured,
  writeSupabaseDataFile,
} from './supabase-data-store';

type MigrationSource = 'github' | 'local';

interface SourceFile {
  path: string;
  size: number;
  read: () => Promise<string>;
}

interface MigrationStats {
  discovered: number;
  eligible: number;
  migrated: number;
  unchanged: number;
  missing: number;
  mismatched: number;
  pending: number;
  skipped: number;
  failed: number;
  bytes: number;
}

const TEXT_EXTENSIONS = new Set(['.json', '.txt', '.md', '.html', '.log', '.csv']);

function normalizedPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function eligible(filePath: string): boolean {
  return TEXT_EXTENSIONS.has(path.posix.extname(filePath).toLowerCase());
}

async function localFiles(rootName: string): Promise<SourceFile[]> {
  const root = path.resolve(PATHS.root, rootName);
  const files: SourceFile[] = [];

  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absolute);
        const relative = normalizedPath(path.relative(PATHS.root, absolute));
        files.push({ path: relative, size: stat.size, read: () => fs.readFile(absolute, 'utf8') });
      }
    }
  }

  await visit(root);
  return files;
}

async function githubFiles(rootNames: string[]): Promise<SourceFile[]> {
  return (await listGitHubFiles(rootNames)).map((file) => ({
    path: normalizedPath(file.path),
    size: file.size,
    read: () => readGitHubFile(file.path),
  }));
}

function argValue(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || '';
}

async function main(): Promise<void> {
  const source = (argValue('source') || 'github') as MigrationSource;
  if (source !== 'github' && source !== 'local') throw new Error('Use --source=github or --source=local.');
  const apply = process.argv.includes('--apply');
  const verifyOnly = process.argv.includes('--verify');
  const roots = (argValue('roots') || 'data,output').split(',').map((item) => item.trim()).filter(Boolean);

  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  }
  process.env.STORAGE_BACKEND = 'supabase';
  if (!supabaseDataStoreConfigured()) throw new Error('Supabase data store is not configured.');
  await assertSupabaseDataStoreReady();

  const sourceFiles = source === 'github'
    ? await githubFiles(roots)
    : (await Promise.all(roots.map(localFiles))).flat();
  const stats: MigrationStats = {
    discovered: sourceFiles.length,
    eligible: 0,
    migrated: 0,
    unchanged: 0,
    missing: 0,
    mismatched: 0,
    pending: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
  };
  const byProject = new Map<string, number>();

  for (const file of sourceFiles.sort((left, right) => left.path.localeCompare(right.path))) {
    if (!eligible(file.path)) {
      stats.skipped += 1;
      continue;
    }
    stats.eligible += 1;
    try {
      const content = await file.read();
      if (file.path.endsWith('.json')) JSON.parse(content);
      const projectKey = projectKeyForDataPath(file.path);
      const hash = createHash('sha256').update(content).digest('hex');
      stats.bytes += Buffer.byteLength(content, 'utf8');
      byProject.set(projectKey, (byProject.get(projectKey) || 0) + 1);

      let existing: Awaited<ReturnType<typeof readSupabaseDataFile>> | null = null;
      try {
        existing = await readSupabaseDataFile(file.path, projectKey);
      } catch (err) {
        if (!(err instanceof DataFileNotFoundError)) throw err;
      }

      const existingHash = existing ? createHash('sha256').update(existing.content).digest('hex') : '';
      if (existingHash === hash) {
        stats.unchanged += 1;
        continue;
      }
      if (verifyOnly) {
        if (existing) stats.mismatched += 1;
        else stats.missing += 1;
        continue;
      }
      if (!apply) {
        stats.pending += 1;
        continue;
      }

      await writeSupabaseDataFile(
        file.path,
        content,
        file.path.endsWith('.json') ? 'json' : 'text',
        `migrate from ${source}`,
        projectKey,
      );
      const saved = await readSupabaseDataFile(file.path, projectKey);
      const savedHash = createHash('sha256').update(saved.content).digest('hex');
      if (savedHash !== hash) throw new Error('Verification hash mismatch after write.');
      stats.migrated += 1;
    } catch (err) {
      stats.failed += 1;
      console.error(`[failed] ${file.path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(JSON.stringify({
    mode: verifyOnly ? 'verify' : apply ? 'apply' : 'dry-run',
    source,
    roots,
    stats,
    projects: Object.fromEntries([...byProject.entries()].sort()),
  }, null, 2));

  if (stats.failed > 0 || (verifyOnly && (stats.missing > 0 || stats.mismatched > 0))) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
