export interface GuidelineChunk {
  index: number;
  page?: number;
  heading: string;
  text: string;
}

const DEFAULT_CHUNK_SIZE = 1800;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
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
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
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
    .filter((token) => token.length >= 3);
}

export function rankGuidelineChunks(chunks: GuidelineChunk[], query: string, limit = 4): GuidelineChunk[] {
  if (!chunks.length) return [];
  const terms = [...new Set(tokens(query))];
  const normalizedQuery = normalize(query).replace(/\s+/g, ' ').trim();
  const scored = chunks.map((chunk) => {
    const content = normalize(chunk.text);
    const title = normalize(chunk.heading);
    let score = 0;
    let coverage = 0;
    for (const term of terms) {
      const occurrences = content.split(term).length - 1;
      if (occurrences > 0) {
        coverage += 1;
        score += 2 + Math.min(occurrences, 4);
      }
      if (title.includes(term)) score += 4;
    }
    if (terms.length) score += (coverage / terms.length) * 6;
    if (normalizedQuery.length >= 8 && content.includes(normalizedQuery)) score += 12;
    if (/\n\|.+\|\n\|[-:| ]+\|/.test(chunk.text) && coverage > 0) score += 2;
    return { chunk, score };
  });

  const matches = scored
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.index - right.chunk.index)
    .slice(0, Math.max(1, limit))
    .map((item) => item.chunk);
  return matches.length ? matches : chunks.slice(0, Math.min(limit, 2));
}
