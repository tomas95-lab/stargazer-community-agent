import * as fs from 'fs/promises';
import * as path from 'path';
import { PATHS } from './config';
import { readDataText } from './data-store';
import { getProjectContext } from './project-context';

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

let cachedGuidelines: string | null = null;

export async function loadProjectGuidelines(): Promise<string> {
  const runtimeGuidelines = getProjectContext().projectGuidelines;
  if (runtimeGuidelines?.trim()) return runtimeGuidelines;

  if (cachedGuidelines !== null) return cachedGuidelines;

  try {
    cachedGuidelines = await readDataText(GUIDELINES_FILE);
  } catch {
    try {
      cachedGuidelines = await fs.readFile(path.resolve(PATHS.root, GUIDELINES_FILE), 'utf-8');
    } catch {
      cachedGuidelines = '';
    }
  }

  return cachedGuidelines;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9]+/i)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function chunkText(text: string, size = 1400): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length > size && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export async function findProjectGuidelineSnippets(query: string, limit = 4): Promise<string[]> {
  const text = await loadProjectGuidelines();
  if (!text.trim()) return [];

  const terms = new Set(tokenize(query));
  const chunks = chunkText(text);

  const scored = chunks.map((chunk, index) => {
    const normalized = normalize(chunk);
    let score = 0;
    for (const term of terms) {
      if (normalized.includes(term)) score += 1;
    }
    return { chunk, index, score };
  });

  const matches = scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.chunk);

  if (matches.length > 0) return matches;

  return chunks.slice(0, Math.min(limit, 2));
}

export async function projectGuidelinesStatus(): Promise<{ available: boolean; characters: number }> {
  const text = await loadProjectGuidelines();
  return {
    available: text.trim().length > 0,
    characters: text.length,
  };
}
