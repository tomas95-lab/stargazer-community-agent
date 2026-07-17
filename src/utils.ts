import * as fs from 'fs';
import * as path from 'path';
import { PATHS, DailyThreadConfig } from './config';
import { readDataJSON } from './data-store';
import { appDateParts, appDayOfWeek, isAppBusinessDay, isAppWeekend } from './timezone';

export function utcDateParts(date = new Date()): { year: number; month: number; day: number; label: string } {
  return appDateParts(date);
}

export function todayDate(now = new Date()): string {
  return utcDateParts(now).label;
}

export function utcDayOfWeek(now = new Date()): number {
  return appDayOfWeek(now);
}

export function isUtcWeekend(now = new Date()): boolean {
  return isAppWeekend(now);
}

export function isUtcBusinessDay(now = new Date()): boolean {
  return isAppBusinessDay(now);
}

export function formatPostTitle(date: string): string {
  const [, mm, dd] = date.split('-');
  return `🧵 Daily thread ${mm}/${dd}`;
}

export async function loadTopics(): Promise<DailyThreadConfig[]> {
  return readDataJSON<DailyThreadConfig[]>('data/topics.json');
}

export async function getTodayTopic(date: string): Promise<DailyThreadConfig> {
  const topics = await loadTopics();
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
