import 'dotenv/config';
import { createHash } from 'crypto';
import { createClient, User } from '@supabase/supabase-js';
import { appDateParts } from './timezone';
import { platformGeminiConfigured } from './ai-runtime';

const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'testing@demo.local';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'testing';
const DEMO_PROJECT_KEY = 'outlier-community-demo';
const DAILY_CALL_LIMIT = 12;
const DAILY_TOKEN_LIMIT = 12_000;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const supabase = createClient(required('SUPABASE_URL'), process.env.SUPABASE_SECRET_KEY || required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser(email: string): Promise<User | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensureDemoUser(): Promise<User> {
  const existing = await findUser(DEMO_EMAIL);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, name: 'Testing User' },
      app_metadata: { ...existing.app_metadata, demo_account: true },
    });
    if (error) throw new Error(error.message);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'Testing User' },
    app_metadata: { demo_account: true },
  });
  if (error) throw new Error(error.message);
  return data.user;
}

async function ensureAiLimits(userId: string): Promise<void> {
  const basePayload = {
    owner_id: userId,
    ai_daily_token_limit: DAILY_TOKEN_LIMIT,
    ai_daily_call_limit: DAILY_CALL_LIMIT,
    updated_at: new Date().toISOString(),
  };
  const modern = await supabase.from('user_ai_keys').upsert({
    ...basePayload,
    gemini_model: 'gemini-3.5-flash-lite',
  }, { onConflict: 'owner_id' });
  if (!modern.error) return;
  if (!/gemini_(api_key_ciphertext|model)/i.test(modern.error.message)) throw new Error(modern.error.message);

  const legacy = await supabase.from('user_ai_keys').upsert({
    ...basePayload,
    anthropic_model: 'legacy-disabled',
  }, { onConflict: 'owner_id' });
  if (legacy.error) throw new Error(legacy.error.message);
}

const GUIDELINES = `# Aurora Evaluation Project Guidelines

## Contributor onboarding
- Contributors must complete every onboarding and qualification course before starting production tasks.
- If all courses are complete but the dashboard still shows EQ or pending, ask the contributor to refresh the dashboard, confirm that the Aurora project is selected, and allow up to 24 hours for assignment synchronization.
- If the status remains unchanged after 24 hours, escalate the case to a QM with the contributor's username. Do not promise assignment or eligibility.

## Task instructions
- The current task instructions are available from the Guidelines link in the project workspace.
- Before submitting a first task, contributors should read the complete instructions, review the rubric, run the required validation checks, and confirm that every requested artifact is attached.
- Never invent task requirements that are not present in these guidelines.

## Support policy
- All contributor-facing replies must be concise, helpful, and written in English.
- Payment, account suspension, disciplinary action, private account details, and eligibility decisions always require human review.
- The demo support session is fictional. Do not provide real Outlier links, schedules, or guarantees.
`;

const AURORA_COMMS = [
  {
    id: 'aurora_welcome', category: 'onboarding', name: 'Aurora Welcome',
    description: 'Welcome contributors to the fictitious Aurora project.', defaultTone: 'friendly',
    supportedTones: ['friendly', 'slack_casual'], audience: ['new_contributors'],
    variables: [{ key: 'guidelinesLink', label: 'Guidelines link', required: true, defaultValue: 'https://example.com/aurora-guidelines' }],
    body: 'Hi and welcome to Aurora!\n\nBefore starting, please review the project guidelines:\n{{guidelinesLink}}\n\nThis is a fictitious demo workspace, so no real contributor action is required.',
  },
  {
    id: 'aurora_daily_check_in', category: 'daily_thread_announcement', name: 'Aurora Daily Check-In',
    description: 'Share the daily check-in with the Aurora demo team.', defaultTone: 'friendly',
    supportedTones: ['friendly', 'slack_casual'], audience: ['all_contributors'],
    variables: [{ key: 'dailyThreadLink', label: 'Daily thread link', required: true, defaultValue: 'https://example.com/aurora-daily-thread' }],
    body: 'Hi team, today\'s Aurora check-in is ready.\n\nPlease share your fictitious progress or blockers here:\n{{dailyThreadLink}}',
  },
  {
    id: 'aurora_quality_reminder', category: 'quality_feedback_escalation', name: 'Aurora Quality Reminder',
    description: 'Remind the demo team to validate work before submission.', defaultTone: 'firm',
    supportedTones: ['friendly', 'firm', 'formal'], audience: ['all_contributors'], variables: [],
    body: 'Aurora team, please review the rubric and run every required validation check before submitting. Confirm that all requested artifacts are attached and that your notes describe observable results.',
  },
  {
    id: 'aurora_calibration_session', category: 'webinar_alignment', name: 'Aurora Calibration Session',
    description: 'Announce an optional fictitious calibration session.', defaultTone: 'formal',
    supportedTones: ['friendly', 'formal'], audience: ['all_contributors'],
    variables: [
      { key: 'sessionTime', label: 'Session time', required: true, defaultValue: '10:00 PST' },
      { key: 'sessionLink', label: 'Session link', required: true, defaultValue: 'https://example.com/aurora-session' },
    ],
    body: 'The optional Aurora calibration session starts at {{sessionTime}}.\n\nDemo session link:\n{{sessionLink}}\n\nThe recording will be shared afterward.',
  },
  {
    id: 'aurora_demo_update', category: 'custom', name: 'Aurora Demo Update',
    description: 'General-purpose project update for the demo workspace.', defaultTone: 'slack_casual',
    supportedTones: ['friendly', 'formal', 'slack_casual'], audience: ['all_contributors'],
    variables: [{ key: 'updateMessage', label: 'Update message', required: true, placeholder: 'Enter a fictitious project update' }],
    body: 'Hey Aurora team,\n\n{{updateMessage}}\n\nThanks for checking the demo update.',
  },
];

async function ensureProject(user: User): Promise<string> {
  const payload = {
    owner_id: user.id,
    owner_email: DEMO_EMAIL,
    owner_name: 'Testing User',
    project_key: DEMO_PROJECT_KEY,
    project_name: 'Aurora Community Demo',
    community_base_url: 'https://demo.community.local',
    community_category_id: '9001',
    community_category_slug: 'aurora-evaluation',
    community_chat_channel_id: '91001',
    discourse_username: 'demo.qm',
    discourse_api_client_id: 'daily-thread-bot',
    discourse_api_key_ciphertext: '',
    project_guidelines: GUIDELINES,
    war_room_link: '',
    agent_mode: 'supervised',
    auto_reply_enabled: false,
    min_confidence: 0.5,
    enabled: true,
    role: 'viewer',
    status: 'active',
    archived_at: null,
    settings: {
      demoMode: true,
      aiLimitsEnforced: true,
      timezone: 'America/Los_Angeles',
      weekdays: [1, 2, 3, 4, 5],
      startTime: '08:00',
      endTime: '17:00',
      autoPost: false,
      autoReact: false,
      dmAutoReply: false,
      communityMaxAnswers: 3,
      dmMaxAutoReplies: 2,
      blockedTopics: ['pay', 'payment', 'account suspension', 'disciplinary action', 'legal', 'eligibility decision'],
    },
    updated_at: new Date().toISOString(),
  };
  const { data: existing, error: lookupError } = await supabase.from('qm_projects').select('id').eq('owner_id', user.id).eq('project_key', DEMO_PROJECT_KEY).maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) {
    const { error } = await supabase.from('qm_projects').update(payload).eq('id', existing.id);
    if (error) throw new Error(error.message);
    return existing.id;
  }
  const { data, error } = await supabase.from('qm_projects').insert(payload).select('id').single();
  if (error) throw new Error(error.message);
  return data.id;
}

function day(offset: number): string {
  const date = new Date(Date.now() + offset * 86_400_000);
  return appDateParts(date).label;
}

function stableUuid(label: string): string {
  const hash = createHash('sha256').update(label).digest('hex').slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}

async function seedQualityHistory(userId: string): Promise<void> {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const offset = index - 6;
    const createdAt = new Date(Date.now() + offset * 86_400_000);
    createdAt.setUTCHours(16 + (index % 2), 0, 0, 0);
    const checked = 8 + index * 2;
    const candidates = 3 + (index % 3);
    const posted = Math.max(1, candidates - 1);
    const needsHuman = candidates - posted;
    const date = createdAt.toISOString().slice(0, 10);
    return [
      {
        id: stableUuid(`${DEMO_PROJECT_KEY}:${date}:community`),
        project_key: DEMO_PROJECT_KEY,
        owner_id: userId,
        action: 'community_agent',
        status: 'success',
        message: 'Fictitious demo Community agent run',
        metadata: { demoSeed: true, checked, candidates, posted, reacted: index % 2, needsHuman },
        detail: null,
        created_at: createdAt.toISOString(),
      },
      {
        id: stableUuid(`${DEMO_PROJECT_KEY}:${date}:dms`),
        project_key: DEMO_PROJECT_KEY,
        owner_id: userId,
        action: 'dm_review',
        status: 'success',
        message: 'Fictitious demo DM review run',
        metadata: {
          demoSeed: true,
          incomingMessages: 4 + (index % 3),
          pendingIncomingMessages: 2 + (index % 2),
          autoReplied: 1 + (index % 2),
          autoNeedsHuman: 1,
        },
        detail: null,
        created_at: new Date(createdAt.getTime() + 30 * 60_000).toISOString(),
      },
    ];
  }).flat();

  const { error } = await supabase.from('automation_events').upsert(rows, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

async function seedFile(filePath: string, value: unknown, reason: string): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const { error } = await supabase.from('project_data_files').upsert({
    project_key: DEMO_PROJECT_KEY,
    file_path: filePath,
    content_type: 'json',
    content,
    size_bytes: Buffer.byteLength(content),
    content_sha256: createHash('sha256').update(content).digest('hex'),
    last_write_reason: reason,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'project_key,file_path' });
  if (error) throw new Error(error.message);
}

async function seedProjectContent(): Promise<void> {
  const topics = [0, 1, 2].map((offset) => ({
    date: day(offset),
    title: ['Getting started with Aurora', 'Writing clear task notes', 'Validation before submission'][offset],
    topic: 'Demo project quality',
    reminderTitle: ['Complete onboarding before production', 'Keep task notes specific', 'Validate every required artifact'][offset],
    reminderBody: ['Review every qualification course and confirm the Aurora project is selected.', 'Document observable decisions and avoid vague language.', 'Run the required checks and attach every requested artifact before submitting.'][offset],
    badExample: 'Submitting without reviewing the project instructions.',
    goodExample: 'Reviewing the rubric and validation results before submission.',
    quickRule: 'Check the guidelines before acting.',
    tags: ['demo_project_announcements'],
    webinar: { enabled: false, mandatory: false, timeLabel: '', link: '' },
  }));
  await Promise.all([
    seedFile(`data/projects/${DEMO_PROJECT_KEY}/topics.json`, topics, 'seed demo topics'),
    seedFile(`data/projects/${DEMO_PROJECT_KEY}/links.json`, { guidelines: 'https://example.com/aurora-demo-guidelines', templatesZip: '', warRoom: '', validationScript: '', commonErrorsDocument: '' }, 'seed demo links'),
    seedFile(`data/projects/${DEMO_PROJECT_KEY}/webinars.json`, [], 'seed demo sessions'),
    seedFile(`data/projects/${DEMO_PROJECT_KEY}/comms-templates.json`, AURORA_COMMS, 'seed Aurora demo comms'),
    seedFile(`data/projects/${DEMO_PROJECT_KEY}/project-memory.json`, {
      updatedAt: new Date().toISOString(),
      facts: [
        { id: 'demo-language', title: 'Support language', body: 'All user-facing replies must be written in English.', source: 'demo policy' },
        { id: 'demo-onboarding', title: 'Pending onboarding', body: 'After completing courses, contributors should refresh, verify the Aurora project selection, and allow up to 24 hours for synchronization.', source: 'demo guidelines' },
        { id: 'demo-sensitive', title: 'Sensitive topics', body: 'Payment and account-specific decisions must be escalated to a human QM.', source: 'demo policy' },
      ],
    }, 'seed demo memory'),
  ]);
}

async function run(): Promise<void> {
  const user = await ensureDemoUser();
  await ensureAiLimits(user.id);
  const projectId = await ensureProject(user);
  await Promise.all([seedProjectContent(), seedQualityHistory(user.id)]);
  console.log(JSON.stringify({
    ok: true,
    username: 'testing',
    projectId,
    geminiConfigured: platformGeminiConfigured(),
    dailyCallLimit: DAILY_CALL_LIMIT,
    dailyTokenLimit: DAILY_TOKEN_LIMIT,
  }));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
