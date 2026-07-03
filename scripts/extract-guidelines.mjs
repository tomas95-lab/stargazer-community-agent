import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

const root = process.cwd();
const input = path.resolve(root, 'project_guidelines.pdf');
const output = path.resolve(root, 'data/project-guidelines.txt');

const buffer = await readFile(input);
const parser = new PDFParse({ data: buffer });

try {
  const result = await parser.getText();
  const cleaned = result.text
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${cleaned}\n`, 'utf-8');
  console.log(`Extracted ${cleaned.length} characters to ${path.relative(root, output)}`);
} finally {
  await parser.destroy();
}
