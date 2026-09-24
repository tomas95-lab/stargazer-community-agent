export interface CronDispatchCheck {
  endpoint: string;
  method?: string;
  source?: string;
  userAgent?: string;
  alreadyDispatched?: boolean;
  isVercel?: boolean;
}

export interface CronDispatchUrlOptions {
  originalUrl: string;
  configuredBaseUrl?: string;
  productionUrl?: string;
  forwardedHost?: string;
  host?: string;
  forwardedProto?: string;
}

const CRON_ENDPOINT = /^\/api\/cron\/(?:daily-thread|community-agent|dm-review|scheduled-messages)(?:\/[^/?]+)?$/;

export function shouldDispatchExternalCron(input: CronDispatchCheck): boolean {
  if (!input.isVercel || input.alreadyDispatched || (input.method || 'GET').toUpperCase() !== 'GET') return false;
  if (!CRON_ENDPOINT.test(input.endpoint)) return false;
  const source = (input.source || '').trim().toLowerCase();
  const userAgent = (input.userAgent || '').trim().toLowerCase();
  return source === 'cron-job.org'
    || source === 'cron-job-org'
    || userAgent.includes('cron-job.org');
}

function normalizeOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Cron dispatch origin must use HTTP or HTTPS.');
  return parsed.origin;
}

export function buildCronDispatchUrl(options: CronDispatchUrlOptions): string {
  const configured = options.configuredBaseUrl || options.productionUrl || '';
  let origin = normalizeOrigin(configured);
  if (!origin) {
    const host = (options.forwardedHost || options.host || '').trim();
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) throw new Error('Could not determine a safe cron dispatch host.');
    const protocol = options.forwardedProto === 'http' ? 'http' : 'https';
    origin = `${protocol}://${host}`;
  }
  return new URL(options.originalUrl, `${origin}/`).toString();
}
