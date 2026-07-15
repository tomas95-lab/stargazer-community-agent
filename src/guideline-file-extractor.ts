export const MAX_GUIDELINE_PDF_BYTES = 12 * 1024 * 1024;

export interface ExtractedGuidelineFile {
  text: string;
  pages: number;
  characters: number;
}

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
    const text = normalizeExtractedGuidelineText(result.text);
    if (!text) {
      throw new Error('No selectable text was found in this PDF. Scanned PDFs need OCR before upload.');
    }

    return {
      text,
      pages: result.total,
      characters: text.length,
    };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
