import webPush from 'web-push';
import type { OperationLogEntry } from './operations-log';
import { runtimeDb, runtimeDbConfigured, runtimeScope, runtimeTableMissing } from './runtime-db';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function env(name: string): string {
  return process.env[name]?.trim() || '';
}

export function pushConfigured(): boolean {
  return Boolean(env('VAPID_PUBLIC_KEY') && env('VAPID_PRIVATE_KEY') && env('VAPID_SUBJECT'));
}

function configure(): void {
  if (!pushConfigured()) throw new Error('Web Push is not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT.');
  webPush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
}

export function vapidPublicKey(): string {
  return env('VAPID_PUBLIC_KEY');
}

export async function savePushSubscription(ownerId: string, projectKey: string, subscription: BrowserPushSubscription, userAgent = ''): Promise<void> {
  if (!runtimeDbConfigured()) throw new Error('Supabase runtime database is not configured.');
  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error('Invalid push subscription.');
  const { error } = await runtimeDb().from('push_subscriptions').upsert({
    owner_id: ownerId,
    project_key: projectKey,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    user_agent: userAgent.slice(0, 500),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}

export async function removePushSubscription(ownerId: string, endpoint: string): Promise<void> {
  if (!runtimeDbConfigured()) return;
  const { error } = await runtimeDb().from('push_subscriptions').delete().eq('owner_id', ownerId).eq('endpoint', endpoint);
  if (error && !runtimeTableMissing(error)) throw new Error(error.message);
}

export async function pushSubscriptionCount(ownerId: string, projectKey: string): Promise<number> {
  if (!runtimeDbConfigured()) return 0;
  const { count, error } = await runtimeDb().from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('project_key', projectKey);
  if (error) {
    if (runtimeTableMissing(error)) return 0;
    throw new Error(error.message);
  }
  return count || 0;
}

export async function sendProjectPush(projectKey: string, payload: PushPayload, ownerId?: string): Promise<{ sent: number; failed: number }> {
  if (!pushConfigured() || !runtimeDbConfigured()) return { sent: 0, failed: 0 };
  configure();
  let query = runtimeDb().from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('project_key', projectKey);
  if (ownerId) query = query.eq('owner_id', ownerId);
  const { data, error } = await query;
  if (error) {
    if (runtimeTableMissing(error)) return { sent: 0, failed: 0 };
    throw new Error(error.message);
  }

  let sent = 0;
  let failed = 0;
  for (const row of data || []) {
    try {
      await webPush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, JSON.stringify(payload), { TTL: 60 * 60 });
      sent += 1;
    } catch (err) {
      failed += 1;
      const statusCode = typeof err === 'object' && err && 'statusCode' in err ? Number((err as { statusCode?: number }).statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) {
        await runtimeDb().from('push_subscriptions').delete().eq('id', row.id);
      }
    }
  }
  return { sent, failed };
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function pushPayloadForOperation(entry: OperationLogEntry): PushPayload | null {
  const metadata = entry.metadata || {};
  if (entry.action === 'community_agent') {
    const candidates = numberValue(metadata.candidates);
    const posted = numberValue(metadata.posted);
    const needsHuman = numberValue(metadata.needsHuman);
    if (!candidates && !posted && !needsHuman) return null;
    return {
      title: posted ? 'Community reply posted' : needsHuman ? 'Community review needed' : 'New Community messages',
      body: `${candidates} candidate${candidates === 1 ? '' : 's'}, ${posted} replied, ${needsHuman} need human review.`,
      url: posted ? '/agent' : needsHuman ? '/review' : '/agent',
      tag: `community:${entry.id}`,
    };
  }
  if (entry.action === 'dm_review') {
    const incoming = numberValue(metadata.newIncomingMessages);
    const replied = numberValue(metadata.autoReplied);
    const needsHuman = numberValue(metadata.autoNeedsHuman);
    if (!incoming && !replied && !needsHuman) return null;
    return {
      title: replied ? 'DM reply posted' : needsHuman ? 'DM review needed' : 'New direct messages',
      body: `${incoming} new message${incoming === 1 ? '' : 's'}, ${replied} replied, ${needsHuman} need human review.`,
      url: needsHuman ? '/review' : '/dms',
      tag: `dm:${entry.id}`,
    };
  }
  if (entry.action === 'dm_reply') {
    return { title: 'DM reply sent', body: entry.message, url: '/dms', tag: `dm-reply:${entry.id}` };
  }
  return null;
}

export async function dispatchOperationPush(entry: OperationLogEntry): Promise<void> {
  const payload = pushPayloadForOperation(entry);
  if (!payload) return;
  const scope = runtimeScope();
  await sendProjectPush(scope.projectKey, payload);
}
