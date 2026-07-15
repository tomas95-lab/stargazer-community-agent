import { DailyThreadConfig } from './config';
import { getProjectContext, isLegacyProjectId } from './project-context';

export interface ProjectLinks {
  guidelines: string;
  templatesZip: string;
  warRoom: string;
  validationScript: string;
  stargazerEval: string;
  commonErrorsDocument: string;
}

export const DEFAULT_PROJECT_LINKS: ProjectLinks = {
  guidelines: 'https://app.outlier.ai/en/expert/guidelines/69cd3d3788bf65e1468428b1?componentId=69398afb50868106e83b1a53&type=attachment',
  templatesZip: 'https://static.remotasks.com/uploads/69cd3d3788bf65e1468428b1/stargazer_templates.zip',
  warRoom: 'https://scale.zoom.us/j/91510346485?pwd=IEPPxvhcHt1W25AXq01eMC3Ynn5SsO.1#success',
  validationScript: 'https://static.remotasks.com/uploads/69cd3d3788bf65e1468428b1/validation_script.zip',
  stargazerEval: 'https://static.remotasks.com/uploads/69cd3d3788bf65e1468428b1/Stargazer_Eval.zip',
  commonErrorsDocument: 'https://app.outlier.ai/en/expert/guidelines/69cd3d3788bf65e1468428b1?componentId=6a1888d2acc7aef0d78b71ea&type=attachment',
};

const DAILY_THREAD_TEMPLATE = `# 🚨 {{title}}

> **TL;DR:** {{quickRule}}

Daily **{{projectName}}** thread is up. Use this thread for blockers, Cursor issues, validation/eval problems, onboarding questions, or task-related doubts.

---

> ## 🚨 MODEL REMINDER
> **Do NOT use Qwen.** The only approved model for this project is **Sonnet 4.6**.
> Please double-check your model before starting or continuing any task.

{{webinarSection}}

---

## 🎯 TODAY'S FOCUS — {{reminderTitle}}

{{reminderBody}}

---

## ❌ What it looks like when it's wrong

\`\`\`
{{badExample}}
\`\`\`

## ✅ What it looks like when it's right

\`\`\`
{{goodExample}}
\`\`\`

---

## 🔗 LINKS

📘 [Guidelines]({{guidelinesLink}})
🧩 [Templates ZIP]({{templatesZipLink}})
🧭 [War Room]({{warRoomLink}})
✅ [Validation Script]({{validationScriptLink}})
✅ [Evaluation Pack]({{stargazerEvalLink}})
📚 [Common Errors Document]({{commonErrorsDocumentLink}})

---

## ✅ FINAL CHECK BEFORE SUBMITTING

\`\`\`
F2P fails Phase 1 and passes Phase 2
P2P passes both phases
Tests validate behavior, not static patterns
No phase detection or hardcoded outcomes
Rubrics are atomic, measurable, and aligned
Validation + eval were run
\`\`\`

Let's keep it clean and review-ready 🚀`;

const ANNOUNCEMENT_TEMPLATE = `Hey team! 👋

Today's [**{{projectName}} daily thread**]({{dailyThreadUrl}}) is up.

Please take a few minutes to read it before tasking today. The topic is **{{topic}}**, with a reminder about **{{reminderTitle}}**.

Quick rule: {{quickRule}}

{{webinarAnnouncement}}

Use the daily thread for blockers, Cursor issues, validation/eval problems, onboarding questions, or task-related doubts 🙌`;

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

function activeProjectName(): string {
  const context = getProjectContext();
  return context.projectName || (isLegacyProjectId(context.projectId) ? 'Stargazer Axiom' : 'the active project');
}

export function renderDailyThread(config: DailyThreadConfig, links?: Partial<ProjectLinks>): string {
  return renderDailyThreadWithLinks(config, links);
}

export function renderDailyThreadWithLinks(
  config: DailyThreadConfig,
  links: Partial<ProjectLinks> = {}
): string {
  const mergedLinks = { ...DEFAULT_PROJECT_LINKS, ...links };
  return interpolate(DAILY_THREAD_TEMPLATE, {
    projectName: activeProjectName(),
    title: config.title,
    reminderTitle: config.reminderTitle,
    reminderBody: config.reminderBody,
    goodExample: config.goodExample,
    badExample: config.badExample,
    quickRule: config.quickRule,
    webinarSection: buildWebinarSection(config),
    guidelinesLink: mergedLinks.guidelines,
    templatesZipLink: mergedLinks.templatesZip,
    warRoomLink: mergedLinks.warRoom,
    validationScriptLink: mergedLinks.validationScript,
    stargazerEvalLink: mergedLinks.stargazerEval,
    commonErrorsDocumentLink: mergedLinks.commonErrorsDocument,
  });
}

export function renderAnnouncement(config: DailyThreadConfig, dailyThreadUrl: string): string {
  return interpolate(ANNOUNCEMENT_TEMPLATE, {
    projectName: activeProjectName(),
    dailyThreadUrl,
    topic: config.topic,
    reminderTitle: config.reminderTitle,
    quickRule: config.quickRule,
    webinarAnnouncement: buildWebinarAnnouncement(config),
  });
}
