const EM_DASH = '\u2014';

export function sanitizeGeneratedText(value: string): string {
  return value.replaceAll(EM_DASH, '-');
}
