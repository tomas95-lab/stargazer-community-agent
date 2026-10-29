import '../server/load-env';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!process.env.SUPABASE_URL || !key) throw new Error('Supabase configuration unavailable.');
  const client = createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await client.auth.signInWithPassword({ email: process.env.DEMO_USER_EMAIL || 'testing@demo.local', password: process.env.DEMO_USER_PASSWORD || 'testing' });
  if (login.error || !login.data.session) throw new Error('Testing account sign-in failed. No credentials changed.');
  assert.equal(login.data.user.app_metadata.demo_account, true, 'Only the demo account may be used');
  const base = process.env.DEMO_TEST_BASE_URL || 'http://localhost:3001';
  const headers: Record<string,string> = { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' };
  const projects = await fetch(`${base}/api/platform/projects`, { headers });
  assert.equal(projects.status, 200);
  const project = ((await projects.json()) as any).projects.find((item: any) => item.settings?.demoMode === true);
  assert.ok(project, 'No existing fictional demo project. No projects were created or modified.');
  headers['X-Project-Id'] = project.id;
  for (const days of [14, 30, 60]) {
    const response = await fetch(`${base}/api/quality?days=${days}`, { headers });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.simulated, true);
    assert.equal(result.daily.length, days);
    assert.ok(result.totals.messages > 0);
    assert.equal(result.totals.aiTokensToday, 0);
  }
  const profilesResponse = await fetch(`${base}/api/demo-diagnostics`, { headers });
  assert.equal(profilesResponse.status, 200);
  const profiles = ((await profilesResponse.json()) as any).profiles;
  assert.equal(profiles.length, 8);
  for (const profile of profiles) {
    const response = await fetch(`${base}/api/demo-diagnostics/preview`, { method: 'POST', headers,
      body: JSON.stringify({ username: profile.username, message: 'I am EQ' }) });
    assert.equal(response.status, 200);
    const result = await response.json() as any;
    assert.equal(result.simulated, true);
    assert.equal(result.draft.draftOnly, true);
  }
  const real = await fetch(`${base}/api/redash`, { headers });
  assert.equal(real.status, 403, 'Demo must never gain real Redash access');
  const denied = await fetch(`${base}/api/demo-diagnostics`);
  assert.equal(denied.status, 401);
  console.log(JSON.stringify({ testingLogin: 'ok', qualityWindows: [14,30,60], fictionalDiagnosticProfiles: profiles.length,
    realRedashAccess: 'denied', anonymousAccess: 'denied', credentialsChanged: false, projectDataChanged: false }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
