import 'dotenv/config';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const TARGET_EMAIL = 'jose.acuna@outlier.ai';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) break;
  }
  return null;
}

function credentialFingerprint(value) {
  return createHash('sha256').update(value || '').digest('hex');
}

const user = await findUserByEmail(TARGET_EMAIL);
if (!user) throw new Error(`User not found: ${TARGET_EMAIL}`);

const { data: credentialBefore, error: credentialError } = await supabase
  .from('user_discourse_keys')
  .select('discourse_api_key_ciphertext,discourse_username,updated_at')
  .eq('owner_id', user.id)
  .maybeSingle();
if (credentialError) throw credentialError;
if (!credentialBefore?.discourse_api_key_ciphertext) {
  throw new Error('Jose does not have a stored Discourse connection to preserve.');
}
const credentialBeforeHash = credentialFingerprint(credentialBefore.discourse_api_key_ciphertext);

const { data: projects, error: projectsError } = await supabase
  .from('qm_projects')
  .select('id,community_chat_channel_id,settings')
  .eq('owner_id', user.id);
if (projectsError) throw projectsError;
if (!projects?.length) throw new Error('Jose does not have an existing workspace to migrate.');

const { error: metadataError } = await supabase.auth.admin.updateUserById(user.id, {
  app_metadata: {
    ...(user.app_metadata || {}),
    account_role: 'csm',
  },
  user_metadata: {
    ...(user.user_metadata || {}),
    account_role: 'csm',
  },
});
if (metadataError) throw metadataError;

for (const project of projects) {
  const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};
  const channels = Array.from(new Set([
    project.community_chat_channel_id,
    ...(Array.isArray(settings.managedChannelIds) ? settings.managedChannelIds : []),
  ].map(String).map((item) => item.trim()).filter((item) => /^\d+$/.test(item)))).slice(0, 30);

  const { error } = await supabase.from('qm_projects').update({
    settings: {
      ...settings,
      workspaceType: 'csm',
      managedChannelIds: channels,
      dailyThreadEnabled: false,
      guidelinesSourceUrl: typeof settings.guidelinesSourceUrl === 'string' ? settings.guidelinesSourceUrl : '',
    },
    updated_at: new Date().toISOString(),
  }).eq('id', project.id).eq('owner_id', user.id);
  if (error) throw error;
}

const { data: credentialAfter, error: afterError } = await supabase
  .from('user_discourse_keys')
  .select('discourse_api_key_ciphertext,discourse_username,updated_at')
  .eq('owner_id', user.id)
  .single();
if (afterError) throw afterError;

const credentialPreserved = credentialFingerprint(credentialAfter.discourse_api_key_ciphertext) === credentialBeforeHash;
if (!credentialPreserved) throw new Error('Discourse credential changed during migration.');

console.log(JSON.stringify({
  ok: true,
  email: TARGET_EMAIL,
  accountRole: 'csm',
  workspacesMigrated: projects.length,
  discourseUsername: credentialAfter.discourse_username,
  discourseCredentialPreserved: credentialPreserved,
  onboardingRequired: false,
}, null, 2));
