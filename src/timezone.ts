export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'America/Los_Angeles';
export const APP_TIME_ZONE_LABEL = process.env.APP_TIME_ZONE_LABEL || 'PST';

export interface AppDateParts {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  label: string;
}

function numberPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value || 0);
}

export function appDateParts(date = new Date()): AppDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = numberPart(parts, 'year');
  const month = numberPart(parts, 'month');
  const day = numberPart(parts, 'day');
  return {
    year,
    month,
    day,
    label: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function appDateTimeParts(date: Date): Required<AppDateParts> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const year = numberPart(parts, 'year');
  const month = numberPart(parts, 'month');
  const day = numberPart(parts, 'day');
  const hour = numberPart(parts, 'hour');
  const minute = numberPart(parts, 'minute');
  const second = numberPart(parts, 'second');
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    label: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function zonedTimeToUtc(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date {
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(desiredUtc);

  for (let index = 0; index < 3; index += 1) {
    const actual = appDateTimeParts(guess);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const diff = desiredUtc - actualAsUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}

export function appDayWindow(now = new Date()): { date: string; start: Date; end: Date } {
  const { year, month, day, label } = appDateParts(now);
  const start = zonedTimeToUtc(year, month, day, 0, 0, 0);
  const nextCalendarDay = new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0));
  const end = zonedTimeToUtc(
    nextCalendarDay.getUTCFullYear(),
    nextCalendarDay.getUTCMonth() + 1,
    nextCalendarDay.getUTCDate(),
    0,
    0,
    0,
  );
  return { date: label, start, end };
}

export function appDayOfWeek(now = new Date()): number {
  const shortDay = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
  }).format(now);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(shortDay);
}

export function isAppWeekend(now = new Date()): boolean {
  const day = appDayOfWeek(now);
  return day === 0 || day === 6;
}

export function isAppBusinessDay(now = new Date()): boolean {
  const day = appDayOfWeek(now);
  return day >= 1 && day <= 5;
}
