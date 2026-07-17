import { CommsTemplate } from './types';
import rawTemplates from '../../data/comms-templates.json';

export function loadTemplates(): CommsTemplate[] {
  return rawTemplates as CommsTemplate[];
}

export function getTemplate(id: string): CommsTemplate | undefined {
  return loadTemplates().find((t) => t.id === id);
}

function interpolate(template: string, vars: Record<string, string>): string {
  let result = normalizeLineEndings(template);
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), normalizeLineEndings(value));
  }
  return result;
}

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
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
