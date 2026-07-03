import * as dotenv from 'dotenv';
dotenv.config();

import { runDailyPublishJob } from './daily-publish-job';
import { appendOperationLog } from './operations-log';
import { runWebinarReminderJob } from './webinar-reminder';

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'y'].includes((value || '').toLowerCase());
}

async function main(): Promise<void> {
  console.log('Running community jobs...');

  if (enabled(process.env.DAILY_PUBLISH_ENABLED)) {
    await runDailyPublishJob();
  } else {
    console.log('Daily publish job disabled. Set DAILY_PUBLISH_ENABLED=true to enable.');
    await appendOperationLog({
      action: 'daily_publish_job',
      status: 'skipped',
      message: 'Daily publish job disabled',
    });
  }

  await runWebinarReminderJob();
  console.log('Community jobs complete.');
}

main().catch((err) => {
  console.error('❌ Community jobs failed:', err);
  process.exit(1);
});
