export interface ChannelGuideline {
  channelId: string;
  channelTitle: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceAuthor: string;
  text: string;
  characters: number;
  syncedAt: string;
}

function valueText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function normalizeChannelGuidelines(
  value: unknown,
  allowedChannelIds: string[] = [],
): ChannelGuideline[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(allowedChannelIds.filter((id) => /^\d+$/.test(id)));
  const byChannel = new Map<string, ChannelGuideline>();

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const channelId = valueText(raw.channelId, 30);
    if (!/^\d+$/.test(channelId) || (allowed.size > 0 && !allowed.has(channelId))) continue;
    const text = valueText(raw.text, 250_000);
    const sourceUrl = valueText(raw.sourceUrl, 2_000);
    if (!text && !sourceUrl) continue;

    byChannel.set(channelId, {
      channelId,
      channelTitle: valueText(raw.channelTitle, 200),
      sourceUrl,
      sourceTitle: valueText(raw.sourceTitle, 500),
      sourceAuthor: valueText(raw.sourceAuthor, 200),
      text,
      characters: text.length,
      syncedAt: valueText(raw.syncedAt, 100),
    });
  }

  return Array.from(byChannel.values()).slice(0, 30);
}

export function channelGuidelineForId(value: unknown, channelId: string): ChannelGuideline | null {
  return normalizeChannelGuidelines(value).find((item) => item.channelId === channelId) || null;
}
