import { chunkGuidelineText, GuidelineChunk } from './guideline-structure';

const DEFAULT_MAX_CHARS = 2600;
const PRIORITY_HEADING = /overview|workflow|general guidelines|task requirements|rubric rules|source of truth/i;
const SKIP_HEADING = /table of contents|change log|tools? reference|policy manual|^table \d+|^page \d+/i;

function cleanText(value: string): string {
  return value
    .replace(/^## Page \d+\s*/i, '')
    .replace(/^### .+\n+/i, '')
    .replace(/^\|[-:| ]+\|$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function clip(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const slice = value.slice(0, maxLength);
  const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'));
  return `${slice.slice(0, boundary > maxLength * 0.55 ? boundary + 1 : maxLength).trim()}...`;
}

function documentTitle(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^#{1,4}\s+Page \d+$/i.test(line) && !/^\|/.test(line))
    ?.replace(/^#{1,4}\s+/, '')
    .slice(0, 140) || 'Project guidelines';
}

function uniqueHeadings(chunks: GuidelineChunk[]): string[] {
  return [...new Set(chunks
    .map((chunk) => chunk.heading.trim())
    .filter((heading) => heading && !SKIP_HEADING.test(heading)))]
    .slice(0, 12);
}

function priorityScore(heading: string): number {
  if (/overview/i.test(heading)) return 0;
  if (/workflow/i.test(heading)) return 1;
  if (/rubric rules|source of truth/i.test(heading)) return 2;
  return 3;
}

function criticalRules(text: string): string[] {
  const flattened = text
    .replace(/^## Page \d+$/gim, '')
    .replace(/\.{4,}/g, ' ')
    .replace(/\s+/g, ' ');
  const explicitRestrictions = flattened.match(/[^.!?]{0,140}\b(?:not permitted|must not)\b[^.!?]{0,180}[.!?]/gi) || [];
  const sentences = flattened
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 35 && sentence.length <= 320)
    .filter((sentence) => /source of truth|not permitted|must not|\bimportant\b|\bnever\b|\bdo not\b/i.test(sentence));
  const cleanedRestrictions = explicitRestrictions.map((rule) => {
    const trimmed = rule.trim().replace(/^[-*]\s+/, '');
    const explicitStart = trimmed.search(/(?:ChatGPT|AI tools|The customer|They|If an assertion|The Initial Prompt)/i);
    return explicitStart >= 0 ? trimmed.slice(explicitStart) : trimmed;
  });
  const sourceTruth = sentences.filter((sentence) => /source of truth/i.test(sentence));
  const remaining = sentences.filter((sentence) => !/source of truth/i.test(sentence));
  return [...new Set([...sourceTruth, ...cleanedRestrictions, ...remaining].map((rule) => rule.replace(/^[-*]\s+/, '')))].slice(0, 4);
}

export function buildProjectBrief(text: string, maxChars = DEFAULT_MAX_CHARS): string {
  const source = text.trim();
  if (!source) return '';
  const chunks = chunkGuidelineText(source);
  const priority = chunks
    .filter((chunk) => PRIORITY_HEADING.test(chunk.heading) && !SKIP_HEADING.test(chunk.heading))
    .sort((left, right) => priorityScore(left.heading) - priorityScore(right.heading) || left.index - right.index);
  const fallback = chunks.filter((chunk) => !SKIP_HEADING.test(chunk.heading));
  const selected = [...priority, ...fallback.filter((chunk) => !priority.includes(chunk))]
    .map((chunk) => ({ heading: chunk.heading, text: cleanText(chunk.text) }))
    .filter((item) => item.text.length >= 20)
    .slice(0, 3);

  const parts = [
    `Project source: ${documentTitle(source)}`,
    ...selected.map((item) => `${item.heading}:\n${clip(item.text, 480)}`),
  ];
  const rules = criticalRules(source);
  if (rules.length) parts.push(`Critical rules:\n${rules.map((rule) => `- ${rule}`).join('\n')}`);
  const headings = uniqueHeadings(chunks);
  if (headings.length) parts.push(clip(`Detailed sections available for retrieval: ${headings.join('; ')}.`, 380));
  parts.push('This brief is orientation only. Use the retrieved original excerpts as the source of truth for detailed answers.');
  return clip(parts.join('\n\n'), Math.max(600, maxChars));
}
