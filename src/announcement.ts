import { DailyThreadConfig } from './config';
import { renderAnnouncement } from './templates';
import { saveFile, copyToClipboard } from './utils';

export async function generateAndSaveAnnouncement(
  config: DailyThreadConfig,
  url: string
): Promise<string> {
  const announcement = renderAnnouncement(config, url);
  const filename = `announcement-${config.date}.md`;
  const filePath = saveFile(filename, announcement);

  const copied = await copyToClipboard(announcement);
  if (copied) {
    console.log('📋 Announcement copied to clipboard');
  } else {
    console.log('⚠️  Could not copy to clipboard (clipboardy not available or no display)');
  }

  return filePath;
}
