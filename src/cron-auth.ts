import { timingSafeEqual } from 'crypto';

export interface CronAuthInput {
  authorization?: string;
  cronSecretHeader?: string;
  endpoint?: string;
  userAgent?: string;
  vercelCronSchedule?: string;
}

const VERCEL_CRON_SCHEDULES: Record<string, string> = {
  '/api/cron/daily-thread/1000': '0 13 * * 1-5',
  '/api/cron/daily-thread/1100': '0 14 * * 1-5',
  '/api/cron/community-agent/1000': '0 13 * * *',
  '/api/cron/community-agent/1130': '30 14 * * *',
  '/api/cron/community-agent/1300': '0 16 * * *',
  '/api/cron/community-agent/1430': '30 17 * * *',
  '/api/cron/community-agent/1600': '0 19 * * *',
  '/api/cron/community-agent/1730': '30 20 * * *',
  '/api/cron/community-agent/1900': '0 22 * * *',
  '/api/cron/dm-review/1530': '30 18 * * *',
  '/api/cron/dm-review/1800': '0 21 * * *',
};

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isExpectedVercelCron(input: CronAuthInput): boolean {
  const endpoint = input.endpoint || '';
  const expectedSchedule = VERCEL_CRON_SCHEDULES[endpoint];
  if (!expectedSchedule) return false;
  if (input.vercelCronSchedule !== expectedSchedule) return false;
  return /^vercel-cron\/1\.0\b/i.test(input.userAgent || '');
}

export function isAuthorizedCronRequest(input: CronAuthInput, secret = process.env.CRON_SECRET || ''): boolean {
  if (!secret) return false;

  const authorization = input.authorization || '';
  if (constantTimeEquals(authorization, `Bearer ${secret}`)) return true;

  const cronSecretHeader = input.cronSecretHeader || '';
  if (constantTimeEquals(cronSecretHeader, secret)) return true;

  return isExpectedVercelCron(input);
}
