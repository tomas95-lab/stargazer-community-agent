import * as fs from 'fs';
import * as path from 'path';
import { DailyThreadConfig, PATHS } from './config';

function loadTemplate(name: string): string {
  return fs.readFileSync(path.join(PATHS.templates, name), 'utf-8');
}

function buildWebinarSection(config: DailyThreadConfig): string {
  if (!config.webinar?.enabled) return '';

  const mandatoryWord = config.webinar.mandatory ? 'mandatory' : 'optional';
  const mandatoryNote = config.webinar.mandatory
    ? 'Attendance is required for invited contributors. Please make sure to join on time so we can align on review/task quality expectations and the current project standards.'
    : 'This session is optional but highly recommended. Join if you can to stay aligned on review/task quality expectations.';

  return `
---

## 🔥 IMPORTANT TODAY: ${config.webinar.mandatory ? 'MANDATORY' : 'OPTIONAL'} ALIGNMENT WEBINAR

We'll have a **${mandatoryWord} alignment webinar today at ${config.webinar.timeLabel}**.

${mandatoryNote}

Webinar link:
${config.webinar.link}${config.webinar.invitees && config.webinar.invitees.length > 0 ? `

**Invited contributors:**
${config.webinar.invitees.map((e) => `- ${e}`).join('\n')}` : ''}`;
}

function buildWebinarAnnouncement(config: DailyThreadConfig): string {
  if (!config.webinar?.enabled) return '';

  const mandatoryWord = config.webinar.mandatory ? 'mandatory' : 'optional';

  let text = `Also, reminder: we have a **${mandatoryWord} alignment webinar today at ${config.webinar.timeLabel}**.\n\nWebinar link:\n${config.webinar.link}`;

  if (config.webinar.mandatory) {
    text += '\n\nAttendance is required for invited contributors. Please make sure to join on time 🙏';
  }

  if (config.webinar.invitees && config.webinar.invitees.length > 0) {
    text += `\n\n**Invited:** ${config.webinar.invitees.join(', ')}`;
  }

  return text;
}

function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function renderDailyThread(config: DailyThreadConfig): string {
  const template = loadTemplate('daily-thread.md');
  return interpolate(template, {
    title: config.title,
    reminderTitle: config.reminderTitle,
    reminderBody: config.reminderBody,
    goodExample: config.goodExample,
    badExample: config.badExample,
    quickRule: config.quickRule,
    webinarSection: buildWebinarSection(config),
  });
}

export function renderAnnouncement(config: DailyThreadConfig, dailyThreadUrl: string): string {
  const template = loadTemplate('announcement.md');
  return interpolate(template, {
    dailyThreadUrl,
    topic: config.topic,
    reminderTitle: config.reminderTitle,
    quickRule: config.quickRule,
    webinarAnnouncement: buildWebinarAnnouncement(config),
  });
}
