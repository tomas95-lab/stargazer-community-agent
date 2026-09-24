import { getProjectContext } from './project-context';
import { appDateParts } from './timezone';

export const DEFAULT_MESSAGE_LOOKBACK_HOURS = 24;
export const MAX_MESSAGE_LOOKBACK_HOURS = 168;

export function normalizeMessageLookbackHours(value: unknown, fallback = DEFAULT_MESSAGE_LOOKBACK_HOURS): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_MESSAGE_LOOKBACK_HOURS, Math.max(1, Math.floor(parsed)));
}

export function configuredMessageLookbackHours(requested?: number): number {
  const configured = getProjectContext().automationSettings?.messageLookbackHours;
  return normalizeMessageLookbackHours(
    requested ?? configured ?? process.env.AGENT_MESSAGE_LOOKBACK_HOURS,
  );
}

export function messageLookbackWindow(now = new Date(), requestedHours?: number): {
  utcDate: string;
  argentinaDate: string;
  lookbackHours: number;
  start: Date;
  end: Date;
  startUtc: string;
  endUtc: string;
} {
  const lookbackHours = configuredMessageLookbackHours(requestedHours);
  const end = new Date(now);
  const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);
  const date = appDateParts(now).label;

  return {
    utcDate: date,
    argentinaDate: date,
    lookbackHours,
    start,
    end,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
  };
}
