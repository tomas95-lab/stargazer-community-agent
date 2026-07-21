import { chunkGuidelineText } from './guideline-structure';

export const MAX_GUIDELINE_PDF_BYTES = 12 * 1024 * 1024;

export interface ExtractedGuidelineFile {
  text: string;
  pages: number;
  characters: number;
  tables: number;
  chunks: number;
  warnings: string[];
}

type PageText = { num: number; text: string };
type PageTables = { num: number; tables: string[][][] };

export function normalizeExtractedGuidelineText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function base64ToBuffer(value: string): Buffer {
  const cleaned = value
    .trim()
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s/g, '');

  return Buffer.from(cleaned, 'base64');
}

export function validatePdfBuffer(buffer: Buffer): void {
  if (!buffer.length) throw new Error('The PDF file is empty.');
  if (buffer.length > MAX_GUIDELINE_PDF_BYTES) {
    throw new Error('The PDF is too large. Upload a PDF up to 12 MB.');
  }
  if (buffer.subarray(0, 4).toString('utf8') !== '%PDF') {
    throw new Error('The uploaded file is not a valid PDF.');
  }
}

function cleanTableCell(value: string): string {
  return normalizeExtractedGuidelineText(value || '')
    .replace(/\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

export function tableToMarkdown(rows: string[][]): string {
  const cleaned = rows
    .map((row) => row.map(cleanTableCell))
    .filter((row) => row.some(Boolean));
  if (!cleaned.length) return '';
  const columns = Math.max(...cleaned.map((row) => row.length));
  const normalizedRows = cleaned.map((row) => Array.from({ length: columns }, (_, index) => row[index] || ''));
  const header = normalizedRows[0].map((cell, index) => cell || `Column ${index + 1}`);
  const separator = header.map(() => '---');
  return [header, separator, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

export function structuredGuidelineText(pages: PageText[], tablePages: PageTables[] = []): { text: string; tables: number } {
  const tablesByPage = new Map(tablePages.map((page) => [page.num, page.tables]));
  let tableCount = 0;
  const sections = pages.map((page) => {
    const parts = [`## Page ${page.num}`];
    const pageText = normalizeExtractedGuidelineText(page.text);
    if (pageText) parts.push(pageText);
    for (const [index, table] of (tablesByPage.get(page.num) || []).entries()) {
      const markdown = tableToMarkdown(table);
      if (!markdown) continue;
      tableCount += 1;
      parts.push(`### Table ${index + 1}`, markdown);
    }
    return parts.join('\n\n');
  });
  return { text: sections.join('\n\n').trim(), tables: tableCount };
}

async function loadPdfParser(): Promise<typeof import('pdf-parse').PDFParse> {
  await import('@napi-rs/canvas').catch(() => undefined);
  const module = await import('pdf-parse');
  return module.PDFParse;
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<ExtractedGuidelineFile> {
  validatePdfBuffer(buffer);

  const PDFParse = await loadPdfParser();
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText({
      lineEnforce: true,
      pageJoiner: '\n\n',
    });
    const warnings: string[] = [];
    let tablePages: PageTables[] = [];
    try {
      const tableResult = await parser.getTable();
      tablePages = tableResult.pages;
    } catch {
      warnings.push('Tables could not be detected, but page text was extracted.');
    }
    const structured = structuredGuidelineText(result.pages, tablePages);
    const text = structured.text;
    if (!text) {
      throw new Error('No selectable text was found in this PDF. Scanned PDFs need OCR before upload.');
    }

    return {
      text,
      pages: result.total,
      characters: text.length,
      tables: structured.tables,
      chunks: chunkGuidelineText(text).length,
      warnings,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
