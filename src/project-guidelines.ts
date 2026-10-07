import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './config';
import { readDataText } from './data-store';
import { getCurrentProjectId, getProjectContext } from './project-context';
import { chunkGuidelineText, GuidelineChunk, rankGuidelineChunks } from './guideline-structure';
import { buildProjectBrief } from './guideline-brief';

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
  'what',
  'when',
  'where',
  'which',
  'should',
  'would',
  'could',
  'about',
  'from',
  'into',
  'under',
  'need',
  'help',
  'please',
  'today',
  'project',
  'message',
  'link',
  'como',
  'cuando',
  'donde',
  'cual',
  'puedo',
  'debo',
  'ayuda',
]);

const MAX_GUIDELINE_CONTEXT_CHARS = 6200;
const QUERY_SYNONYMS = new Map<string, string>([
  ['rubrica', 'rubric'],
  ['rubricas', 'rubrics'],
  ['criterio', 'criterion'],
  ['criterios', 'criteria'],
  ['atomico', 'atomic'],
  ['atomica', 'atomic'],
  ['trayectoria', 'trajectory'],
  ['politica', 'policy'],
  ['politicas', 'policies'],
  ['herramienta', 'tool'],
  ['herramientas', 'tools'],
  ['tarjeta', 'card'],
  ['transaccion', 'transaction'],
  ['transacciones', 'transactions'],
  ['cuenta', 'account'],
  ['pago', 'payment'],
  ['pagos', 'payments'],
  ['reformular', 'rephrase'],
  ['reescribir', 'rephrase'],
  ['instrucciones', 'guidelines'],
]);

const cachedGuidelines = new Map<string, string>();
const cachedChunks = new Map<string, { text: string; chunks: GuidelineChunk[] }>();
const cachedBriefs = new Map<string, { text: string; brief: string }>();

export interface ProjectGuidelineBriefStatus {
  available: boolean;
  brief: string;
  sourceCharacters: number;
  briefCharacters: number;
  estimatedTokens: number;
  sectionCount: number;
}

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

function isComplexGuidelineQuery(query: string): boolean {
  const normalized = query.toLowerCase();
  const domainTerms = normalized.match(/\b(?:rubric|policy|tool|trajectory|assertion|criteria)\b/g) || [];
  return query.length >= 240
    || (query.match(/\?/g) || []).length >= 2
    || domainTerms.length >= 3
    || /\b(?:compare|multiple|workflow|step by step|difference between|why\b.+\band\b|how\b.+\band\b)/i.test(normalized);
}

function withinContextBudget(snippets: string[]): string[] {
  const selected: string[] = [];
  let characters = 0;
  for (const snippet of snippets) {
    if (selected.length > 0 && characters + snippet.length > MAX_GUIDELINE_CONTEXT_CHARS) break;
    selected.push(snippet);
    characters += snippet.length;
  }
  return selected;
}

export async function projectGuidelineBrief(): Promise<string> {
  const text = await loadProjectGuidelines();
  if (!text.trim()) return '';
  const projectId = getCurrentProjectId();
  const cached = cachedBriefs.get(projectId);
  if (cached?.text === text) return cached.brief;
  const brief = buildProjectBrief(text);
  cachedBriefs.set(projectId, { text, brief });
  if (cachedBriefs.size > 50) cachedBriefs.delete(cachedBriefs.keys().next().value as string);
  return brief;
}

export async function projectGuidelineBriefStatus(): Promise<ProjectGuidelineBriefStatus> {
  const text = await loadProjectGuidelines();
  if (!text.trim()) {
    return {
      available: false,
      brief: '',
      sourceCharacters: 0,
      briefCharacters: 0,
      estimatedTokens: 0,
      sectionCount: 0,
    };
  }
  const brief = await projectGuidelineBrief();
  const sections = new Set(
    guidelineChunks(getCurrentProjectId(), text)
      .map((chunk) => chunk.heading.trim())
      .filter((heading) => heading && !/^Page \d+$/i.test(heading)),
  );
  return {
    available: Boolean(brief),
    brief,
    sourceCharacters: text.length,
    briefCharacters: brief.length,
    estimatedTokens: brief ? Math.max(1, Math.ceil(brief.length / 4)) : 0,
    sectionCount: sections.size,
  };
}

export async function findGuidelineSnippetsForChannel(query: string, channelId = '', limit = 4): Promise<string[]> {
  const text = await loadProjectGuidelines();
  const filteredQuery = query
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => QUERY_SYNONYMS.get(word.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')) || word)
    .join(' ');
  const rankedQuery = filteredQuery || query;
  const effectiveLimit = Math.max(1, Math.min(limit, isComplexGuidelineQuery(query) ? 4 : 2));
  const projectId = getCurrentProjectId();
  const channelGuideline = getProjectContext().channelGuidelines?.find((item) => item.channelId === channelId);
  const channelLimit = channelGuideline?.text.trim() ? Math.max(1, effectiveLimit - 1) : 0;
  const channelSnippets = channelGuideline?.text.trim()
    ? rankGuidelineChunks(
      guidelineChunks(`${projectId}:channel:${channelId}`, channelGuideline.text),
      rankedQuery,
      channelLimit,
    ).map((chunk) => `[Channel guideline: ${channelGuideline.channelTitle || channelId}]\n${chunk.text}`)
    : [];
  const globalLimit = Math.max(0, effectiveLimit - channelSnippets.length);
  const globalSnippets = text.trim() && globalLimit > 0
    ? rankGuidelineChunks(guidelineChunks(projectId, text), rankedQuery, globalLimit)
      .map((chunk) => `[Global guideline]\n${chunk.text}`)
    : [];
  return withinContextBudget([...channelSnippets, ...globalSnippets]);
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
