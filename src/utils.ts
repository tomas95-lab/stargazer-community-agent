import * as fs from 'fs';
import * as path from 'path';
import { PATHS, DailyThreadConfig } from './config';

export function todayDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatPostTitle(date: string): string {
  const [, mm, dd] = date.split('-');
  return `🧵 Daily thread ${mm}/${dd}`;
}

export function loadTopics(): DailyThreadConfig[] {
  const filePath = path.join(PATHS.data, 'topics.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function getTodayTopic(date: string): DailyThreadConfig {
  const topics = loadTopics();
  const match = topics.find((t) => t.date === date);
  if (match) return match;

  const fallback = topics[0];
  if (!fallback) {
    throw new Error('No topics found in data/topics.json');
  }
  return { ...fallback, date };
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveFile(filename: string, content: string): string {
  ensureDir(PATHS.output);
  const filePath = path.join(PATHS.output, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const clipboardy = await import('clipboardy');
    await clipboardy.default.write(text);
    return true;
  } catch {
    return false;
  }
}

export function parseArgs(): { mode: 'dry-run' | 'publish'; yes: boolean } {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isPublish = args.includes('--publish');
  const yes = args.includes('--yes');

  if (!isDryRun && !isPublish) {
    console.error('Usage: npm run daily -- --dry-run | --publish [--yes]');
    process.exit(1);
  }

  return {
    mode: isDryRun ? 'dry-run' : 'publish',
    yes,
  };
}

export function askConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${question} (y/N): `, (answer: string) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
