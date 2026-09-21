export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimeZone(value: unknown, fallback = DEFAULT_TIME_ZONE): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const normalizedWhitespace = raw.replace(/\s+/g, '_');

  for (const candidate of [raw, normalizedWhitespace]) {
    if (candidate && isValidTimeZone(candidate)) return candidate;
  }

  return isValidTimeZone(fallback) ? fallback : DEFAULT_TIME_ZONE;
}
