import * as fs from 'fs';
import * as path from 'path';
import { loadTemplates, renderTemplate } from './renderer';
import { CATEGORY_LABELS, CommsTemplateCategory } from './types';

const PATHS_OUTPUT = path.resolve(__dirname, '../../output');

function parseCliArgs(): Record<string, string> {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        result[key] = next;
        i++;
      } else {
        result[key] = 'true';
      }
    }
  }
  return result;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main(): void {
  const args = parseCliArgs();
  const templates = loadTemplates();

  if ('list' in args) {
    const category = args.category as CommsTemplateCategory | undefined;
    const filtered = category ? templates.filter((t) => t.category === category) : templates;
    console.log('\nAvailable templates:\n');
    for (const t of filtered) {
      const catLabel = CATEGORY_LABELS[t.category] || t.category;
      console.log(`  [${catLabel}] ${t.id}`);
      console.log(`    ${t.name}`);
      if (t.variables.length > 0) {
        const vars = t.variables.map((v) => `--${v.key}${v.required ? ' (required)' : ''}`).join(' ');
        console.log(`    Variables: ${vars}`);
      }
      console.log('');
    }
    return;
  }

  const templateId = args.template;
  if (!templateId) {
    console.error('Usage:');
    console.error('  npm run comms -- --template <id> [--var value ...]');
    console.error('  npm run comms -- --list [--category <category>]');
    console.error('\nExamples:');
    console.error('  npm run comms -- --template model_update --oldModel Qwen --newModel "Sonnet 4.6"');
    console.error('  npm run comms -- --template webinar_live_now --webinarLink "https://zoom.us/..."');
    console.error('  npm run comms -- --template war_room_join_for_context');
    console.error('  npm run comms -- --list');
    console.error('  npm run comms -- --list --category war_room');
    process.exit(1);
  }

  const template = templates.find((t) => t.id === templateId);
  if (!template) {
    console.error(`Template "${templateId}" not found.`);
    console.error('Run `npm run comms -- --list` to see all available templates.');
    process.exit(1);
  }

  const vars: Record<string, string> = {};
  for (const v of template.variables) {
    if (args[v.key] !== undefined) {
      vars[v.key] = args[v.key];
    }
  }

  const { output, errors } = renderTemplate(template, vars);

  if (errors.length > 0) {
    console.error('\nValidation errors:');
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Template: ${template.name}`);
  console.log(`Category: ${CATEGORY_LABELS[template.category]}`);
  console.log('='.repeat(60));
  console.log(output);
  console.log('='.repeat(60) + '\n');

  if ('save' in args) {
    ensureDir(PATHS_OUTPUT);
    const filename = `comms-${templateId}-${Date.now()}.md`;
    const filePath = path.join(PATHS_OUTPUT, filename);
    fs.writeFileSync(filePath, output, 'utf-8');
    console.log(`Saved to: ${filePath}`);
  }
}

main();
