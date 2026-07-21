import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './config';
import { readDataText } from './data-store';
import { getCurrentProjectId, getProjectContext } from './project-context';
import { chunkGuidelineText, GuidelineChunk, rankGuidelineChunks } from './guideline-structure';

const GUIDELINES_FILE = 'data/project-guidelines.txt';
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'you',
  'your',
  'are',
  'can',
  'have',
  'has',
  'como',
  'para',
  'que',
  'con',
  'una',
  'por',
  'los',
  'las',
  'del',
  'estoy',
  'tengo',
]);

const cachedGuidelines = new Map<string, string>();
const cachedChunks = new Map<string, { text: string; chunks: GuidelineChunk[] }>();

function guidelineChunks(projectId: string, text: string): GuidelineChunk[] {
  const cached = cachedChunks.get(projectId);
  if (cached?.text === text) return cached.chunks;
  const chunks = chunkGuidelineText(text);
  cachedChunks.set(projectId, { text, chunks });
  if (cachedChunks.size > 50) cachedChunks.delete(cachedChunks.keys().next().value as string);
  return chunks;
}

export async function loadProjectGuidelines(): Promise<string> {
  const runtimeGuidelines = getProjectContext().projectGuidelines;
  if (runtimeGuidelines?.trim()) return runtimeGuidelines;

  const projectId = getCurrentProjectId();
  const cached = cachedGuidelines.get(projectId);
  if (cached !== undefined) return cached;

  let guidelines = '';
  try {
    guidelines = await readDataText(GUIDELINES_FILE);
  } catch {
    try {
      guidelines = await fs.readFile(path.resolve(PATHS.root, GUIDELINES_FILE), 'utf-8');
    } catch {
      guidelines = '';
    }
  }

  cachedGuidelines.set(projectId, guidelines);
  return guidelines;
}

export async function findProjectGuidelineSnippets(query: string, limit = 4): Promise<string[]> {
  const text = await loadProjectGuidelines();
  if (!text.trim()) return [];
  const filteredQuery = query.split(/\s+/).filter((word) => !STOP_WORDS.has(word.toLowerCase())).join(' ');
  return rankGuidelineChunks(guidelineChunks(getCurrentProjectId(), text), filteredQuery || query, limit).map((chunk) => chunk.text);
}

export async function projectGuidelinesStatus(): Promise<{ available: boolean; characters: number }> {
  const text = await loadProjectGuidelines();
  return {
    available: text.trim().length > 0,
    characters: text.length,
  };
}
