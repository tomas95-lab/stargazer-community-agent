export const APP_TIME_ZONE = 'America/Los_Angeles';
export const APP_TIME_ZONE_LABEL = 'PST';

export function todayAppDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
}

export function formatAppTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatAppTimeWithSeconds(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

export function formatAppDateTime(value?: string): string {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function withAppTimeZone(value: string): string {
  return `${value} ${APP_TIME_ZONE_LABEL}`;
}

function partsInAppTime(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
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
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}

export function appDateTimeToDate(dateLabel: string, timeLabel: string): Date {
  const [year, month, day] = dateLabel.split('-').map(Number);
  const [hour, minute] = timeLabel.split(':').map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = new Date(desiredUtc);

  for (let index = 0; index < 3; index += 1) {
    const actual = partsInAppTime(guess);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = desiredUtc - actualAsUtc;
    if (diff === 0) break;
    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}
