export interface GuidelineChunk {
  index: number;
  page?: number;
  heading: string;
  text: string;
}

const DEFAULT_CHUNK_SIZE = 1800;

const LOW_SIGNAL_HEADINGS = /^(?:table of contents|change log|page \d+)$/i;
const SEARCH_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'you', 'your', 'are', 'can', 'have', 'has',
  'what', 'when', 'where', 'which', 'why', 'how', 'should', 'would', 'could', 'about', 'from',
  'into', 'under', 'need', 'help', 'please', 'today', 'project', 'message', 'write', 'get',
  'como', 'cuando', 'donde', 'cual', 'puedo', 'debo', 'ayuda', 'para', 'que', 'con', 'una',
  'por', 'los', 'las', 'del', 'estoy', 'tengo',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function cleanStructuralHeading(value: string): string {
  return value
    .replace(/\.{4,}.*$/, '')
    .replace(/^(?:0?\d+)\s+(?=\d+\.\d+\s)/, '')
    .replace(/^(Step\s+\d+)\s*[^A-Za-z0-9\s:.-]+\s*/i, '$1: ')
    .replace(/\s+/g, ' ')
    .trim();
}

function structuralHeading(line: string): string {
  const value = line.trim();
  if (!value || value.length > 120 || /\.{4,}/.test(value)) return '';
  if (/^(?:project overview|project workflow|detailed general guidelines|appendix|change log|table of contents)$/i.test(value)) {
    return cleanStructuralHeading(value);
  }
  if (/^step\s+\d+\b/i.test(value)) return cleanStructuralHeading(value);
  if (/^(?:0?\d+\s+)?\d+\.\d+\s+[A-Z]/.test(value)) return cleanStructuralHeading(value);
  if (/^Money Heist(?:\s+Project)?\s+(?:Attempter\s+-\s+Guidelines|Agent Tools Reference|Tools Reference|Policy Manual)$/i.test(value)) {
    return cleanStructuralHeading(value);
  }
  if (/^[A-Z][A-Za-z0-9 &'/-]{2,80}(?:Guidelines|Policy Manual|Tools Reference)$/.test(value)) {
    return cleanStructuralHeading(value);
  }
  return '';
}

function documentBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const value = current.join('\n').trim();
    if (value) blocks.push(value);
    current = [];
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^#{1,4}\s+/.test(trimmed)) {
      flush();
      blocks.push(trimmed);
      continue;
    }
    const heading = structuralHeading(trimmed);
    if (heading) {
      flush();
      blocks.push(`### ${heading}`);
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

function splitLargeBlock(block: string, maxLength: number): string[] {
  if (block.length <= maxLength) return [block];
  const lines = block.split('\n').filter((line) => line.trim());
  const isTable = lines.length >= 2 && lines.every((line) => line.trim().startsWith('|'));
  const prefix = isTable ? lines.slice(0, 2) : [];
  const source = isTable ? lines.slice(2) : lines;
  const parts: string[] = [];
  let current = prefix.join('\n');

  for (const line of source) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      parts.push(current);
      current = prefix.length ? `${prefix.join('\n')}\n${line}` : line;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);

  if (parts.length === 1 && parts[0].length > maxLength) {
    const text = parts[0];
    const slices: string[] = [];
    let offset = 0;
    while (offset < text.length) {
      let end = Math.min(text.length, offset + maxLength);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
        if (boundary > offset + Math.floor(maxLength * 0.6)) end = boundary + 1;
      }
      slices.push(text.slice(offset, end).trim());
      offset = end;
    }
    return slices.filter(Boolean);
  }

  return parts.filter(Boolean);
}

export function chunkGuidelineText(text: string, maxLength = DEFAULT_CHUNK_SIZE): GuidelineChunk[] {
  const blocks = documentBlocks(text);
  const chunks: GuidelineChunk[] = [];
  let page: number | undefined;
  let heading = '';
  let current = '';

  const flush = () => {
    if (!current.trim()) return;
    chunks.push({ index: chunks.length, page, heading, text: current.trim() });
    current = '';
  };

  const contextPrefix = () => [
    page ? `## Page ${page}` : '',
    heading && heading !== `Page ${page}` ? `### ${heading}` : '',
  ].filter(Boolean).join('\n\n');

  for (const block of blocks) {
    const pageMatch = block.match(/^##\s+Page\s+(\d+)$/i);
    if (pageMatch) {
      flush();
      page = Number(pageMatch[1]);
      heading = `Page ${page}`;
      continue;
    }
    const headingMatch = block.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = headingMatch[1].trim();
      continue;
    }

    const prefix = contextPrefix();
    const available = Math.max(500, maxLength - prefix.length - 2);
    for (const part of splitLargeBlock(block, available)) {
      const candidate = current ? `${current}\n\n${part}` : [prefix, part].filter(Boolean).join('\n\n');
      if (candidate.length > maxLength && current) {
        flush();
        current = [prefix, part].filter(Boolean).join('\n\n');
      } else {
        current = candidate;
      }
    }
  }
  flush();
  return chunks;
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3 && !SEARCH_STOP_WORDS.has(token));
}

function tokenSet(value: string): Set<string> {
  return new Set(tokens(value));
}

function similarity(left: string, right: string): number {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / Math.min(a.size, b.size);
}

export interface RankedGuidelineChunk {
  chunk: GuidelineChunk;
  score: number;
  coverage: number;
}

export function rankGuidelineChunkMatches(chunks: GuidelineChunk[], query: string, limit = 4): RankedGuidelineChunk[] {
  if (!chunks.length) return [];
  const terms = [...new Set(tokens(query))];
  if (!terms.length) return [];
  const normalizedQuery = normalize(query).replace(/\s+/g, ' ').trim();
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    documentFrequency.set(term, chunks.filter((chunk) => tokenSet(chunk.text).has(term)).length);
  }

  const scored = chunks.map((chunk) => {
    const content = normalize(chunk.text);
    const contentTokens = tokens(chunk.text);
    const contentFrequency = new Map<string, number>();
    for (const token of contentTokens) contentFrequency.set(token, (contentFrequency.get(token) || 0) + 1);
    const titleTokens = tokenSet(chunk.heading);
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      const occurrences = contentFrequency.get(term) || 0;
      const titleMatch = titleTokens.has(term);
      if (occurrences <= 0 && !titleMatch) continue;
      matched += 1;
      const frequency = documentFrequency.get(term) || 0;
      const rarity = Math.log((chunks.length + 1) / (frequency + 1)) + 1;
      score += rarity * (titleMatch ? 5 : 2);
      score += Math.min(Math.max(occurrences, 0), 3) * 0.6;
    }
    const coverage = matched / terms.length;
    const hasQueryBigram = terms.length < 3 || terms.some((term, index) => (
      index < terms.length - 1 && content.includes(`${term} ${terms[index + 1]}`)
    ));
    score += coverage * 5;
    if (normalizedQuery.length >= 8 && content.includes(normalizedQuery)) score += 12;
    if (/\n\|.+\|\n\|[-:| ]+\|/.test(chunk.text) && matched > 0) score += 1;
    if (LOW_SIGNAL_HEADINGS.test(chunk.heading)) score *= 0.45;
    return { chunk, score, coverage, hasQueryBigram };
  });

  const candidates = scored
    .filter((item) => item.score >= 4
      && item.coverage >= (terms.length >= 4 ? 0.25 : 0.34)
      && (item.hasQueryBigram || item.coverage >= 0.75))
    .sort((left, right) => right.score - left.score || right.coverage - left.coverage || left.chunk.index - right.chunk.index);
  const selected: RankedGuidelineChunk[] = [];
  for (const item of candidates) {
    if (selected.some((existing) => similarity(existing.chunk.text, item.chunk.text) >= 0.82)) continue;
    selected.push(item);
    if (selected.length >= Math.max(1, limit)) break;
  }
  return selected;
}

export function rankGuidelineChunks(chunks: GuidelineChunk[], query: string, limit = 4): GuidelineChunk[] {
  return rankGuidelineChunkMatches(chunks, query, limit).map((item) => item.chunk);
}
