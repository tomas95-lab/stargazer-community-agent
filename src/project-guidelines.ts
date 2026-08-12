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
  return findGuidelineSnippetsForChannel(query, '', limit);
}

export async function findGuidelineSnippetsForChannel(query: string, channelId = '', limit = 4): Promise<string[]> {
  const text = await loadProjectGuidelines();
  const filteredQuery = query.split(/\s+/).filter((word) => !STOP_WORDS.has(word.toLowerCase())).join(' ');
  const rankedQuery = filteredQuery || query;
  const projectId = getCurrentProjectId();
  const channelGuideline = getProjectContext().channelGuidelines?.find((item) => item.channelId === channelId);
  const channelLimit = channelGuideline?.text.trim() ? Math.max(1, limit - 1) : 0;
  const channelSnippets = channelGuideline?.text.trim()
    ? rankGuidelineChunks(
      guidelineChunks(`${projectId}:channel:${channelId}`, channelGuideline.text),
      rankedQuery,
      channelLimit,
    ).map((chunk) => `[Channel guideline: ${channelGuideline.channelTitle || channelId}]\n${chunk.text}`)
    : [];
  const globalLimit = Math.max(0, limit - channelSnippets.length);
  const globalSnippets = text.trim() && globalLimit > 0
    ? rankGuidelineChunks(guidelineChunks(projectId, text), rankedQuery, globalLimit)
      .map((chunk) => `[Global guideline]\n${chunk.text}`)
    : [];
  return [...channelSnippets, ...globalSnippets];
}

export async function projectGuidelinesStatus(): Promise<{ available: boolean; characters: number; channelGuidelines: number }> {
  const text = await loadProjectGuidelines();
  const channelGuidelines = getProjectContext().channelGuidelines?.filter((item) => item.text.trim()).length || 0;
  return {
    available: text.trim().length > 0 || channelGuidelines > 0,
    characters: text.length,
    channelGuidelines,
  };
}
