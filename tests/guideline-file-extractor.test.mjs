import test from 'node:test';
import assert from 'node:assert/strict';
import {
  base64ToBuffer,
  extractTextFromPdfBuffer,
  MAX_GUIDELINE_PDF_BYTES,
  normalizeExtractedGuidelineText,
  structuredGuidelineText,
  tableToMarkdown,
  validatePdfBuffer,
} from '../dist/guideline-file-extractor.js';

function minimalPdfWithText(text) {
  const chunks = [];
  const offsets = [0];
  const add = (value) => chunks.push(Buffer.from(value, 'binary'));
  const offset = () => chunks.reduce((sum, part) => sum + part.length, 0);
  const obj = (number, body) => {
    offsets[number] = offset();
    add(`${number} 0 obj\n${body}\nendobj\n`);
  };

  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
  obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const stream = `BT /F1 18 Tf 36 96 Td (${text}) Tj ET`;
  obj(5, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  const xrefOffset = offset();
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let index = 1; index <= 5; index += 1) {
    add(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.concat(chunks);
}

test('normalizeExtractedGuidelineText trims noisy PDF whitespace', () => {
  const text = normalizeExtractedGuidelineText('  First   line  \r\n\r\n\r\n  Second\t\tline  \n\n\nThird  ');

  assert.equal(text, 'First line\n\nSecond line\n\nThird');
});

test('base64ToBuffer accepts PDF data URIs', () => {
  const buffer = base64ToBuffer(`data:application/pdf;base64,${Buffer.from('%PDF-1.7').toString('base64')}`);

  assert.equal(buffer.toString('utf8'), '%PDF-1.7');
});

test('validatePdfBuffer rejects non-PDF data', () => {
  assert.throws(() => validatePdfBuffer(Buffer.from('not a pdf')), /not a valid PDF/);
});

test('validatePdfBuffer rejects oversized PDFs', () => {
  const buffer = Buffer.concat([Buffer.from('%PDF'), Buffer.alloc(MAX_GUIDELINE_PDF_BYTES)]);

  assert.throws(() => validatePdfBuffer(buffer), /too large/);
});

test('tableToMarkdown preserves rows, columns, and pipe characters', () => {
  assert.equal(
    tableToMarkdown([['Status', 'Action'], ['EQ', 'Join | ask for access']]),
    '| Status | Action |\n| --- | --- |\n| EQ | Join \\| ask for access |'
  );
});

test('structuredGuidelineText keeps page boundaries and detected tables', () => {
  const result = structuredGuidelineText(
    [{ num: 1, text: 'Access instructions' }],
    [{ num: 1, tables: [[['State', 'Next step'], ['EQ', 'Request access']]] }]
  );
  assert.match(result.text, /## Page 1/);
  assert.match(result.text, /\| EQ \| Request access \|/);
  assert.equal(result.tables, 1);
});

test('extractTextFromPdfBuffer extracts selectable PDF text', async () => {
  const result = await extractTextFromPdfBuffer(minimalPdfWithText('Cursor access guideline'));

  assert.equal(result.text, '## Page 1\n\nCursor access guideline');
  assert.equal(result.pages, 1);
  assert.equal(result.characters, result.text.length);
  assert.equal(result.tables, 0);
  assert.equal(result.chunks, 1);
});
