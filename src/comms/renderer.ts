import * as fs from 'fs';
import * as path from 'path';
import { CommsTemplate } from './types';

const TEMPLATES_PATH = path.resolve(__dirname, '../../data/comms-templates.json');

export function loadTemplates(): CommsTemplate[] {
  return JSON.parse(fs.readFileSync(TEMPLATES_PATH, 'utf-8'));
}

export function getTemplate(id: string): CommsTemplate | undefined {
  return loadTemplates().find((t) => t.id === id);
}

function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export interface RenderResult {
  output: string;
  errors: string[];
}

export function renderTemplate(
  template: CommsTemplate,
  vars: Record<string, string>
): RenderResult {
  const errors: string[] = [];

  for (const v of template.variables) {
    const value = vars[v.key] ?? v.defaultValue ?? '';
    if (v.required && !value.trim()) {
      errors.push(`"${v.label}" is required`);
    }
  }

  if (errors.length > 0) {
    return { output: '', errors };
  }

  const merged: Record<string, string> = {};
  for (const v of template.variables) {
    merged[v.key] = vars[v.key] ?? v.defaultValue ?? '';
  }

  return { output: interpolate(template.body, merged), errors: [] };
}
