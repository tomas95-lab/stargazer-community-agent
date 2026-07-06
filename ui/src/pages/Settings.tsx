import { useState, useEffect } from 'react';
import { api } from '../api';

const LABELS: Record<string, string> = {
  COMMUNITY_BASE_URL: 'Community Base URL',
  COMMUNITY_CATEGORY_ID: 'Category ID',
  COMMUNITY_CATEGORY_SLUG: 'Category Slug',
  COMMUNITY_CHAT_CHANNEL_ID: 'Chat Channel ID',
  DISCOURSE_API_KEY: 'Discourse API Key',
  DISCOURSE_API_CLIENT_ID: 'Discourse API Client ID',
  DISCOURSE_USERNAME: 'Discourse Username',
  DATA_STORE_REQUESTED: 'Data Store Requested',
  DATA_STORE_ACTIVE: 'Data Store Active',
  ANTHROPIC_CONFIGURED: 'Claude Configured',
  ANTHROPIC_MODEL: 'Claude Model',
  CRON_CONFIGURED: 'Cron Configured',
  AGENT_AUTO_POST: 'Agent Auto Post',
  DM_AUTO_REPLY: 'DM Auto Reply',
  DM_AUTO_REPLY_MAX: 'DM Auto Reply Max',
};

const AUTOMATION_SCHEDULE = [
  {
    job: 'Daily Thread',
    endpoint: '/api/cron/daily-thread/1000',
    utc: '13:00 UTC',
    arg: '10:00 ARG',
    purpose: 'Primary publish attempt',
  },
  {
    job: 'Daily Thread',
    endpoint: '/api/cron/daily-thread/1100',
    utc: '14:00 UTC',
    arg: '11:00 ARG',
    purpose: 'Retry if not already published',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1000',
    utc: '13:00 UTC',
    arg: '10:00 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1130',
    utc: '14:30 UTC',
    arg: '11:30 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1300',
    utc: '16:00 UTC',
    arg: '13:00 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1430',
    utc: '17:30 UTC',
    arg: '14:30 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1600',
    utc: '19:00 UTC',
    arg: '16:00 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1730',
    utc: '20:30 UTC',
    arg: '17:30 ARG',
    purpose: 'Community check',
  },
  {
    job: 'Community Agent',
    endpoint: '/api/cron/community-agent/1900',
    utc: '22:00 UTC',
    arg: '19:00 ARG',
    purpose: 'Final community check',
  },
  {
    job: 'DM Review',
    endpoint: '/api/cron/dm-review/1530',
    utc: '18:30 UTC',
    arg: '15:30 ARG',
    purpose: 'Afternoon DM scan',
  },
  {
    job: 'DM Review',
    endpoint: '/api/cron/dm-review/1800',
    utc: '21:00 UTC',
    arg: '18:00 ARG',
    purpose: 'End-of-day DM scan',
  },
];

export default function Settings() {
  const [config, setConfig] = useState<Record<string, string>>({});

  useEffect(() => {
    api.getConfig().then(setConfig);
  }, []);

  const inputCls = 'sg-input cursor-not-allowed px-3 py-2 text-sm text-muted-foreground';

  return (
    <div className="space-y-6 px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <span className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">Environment managed</span>
      </div>

      <div className="sg-panel space-y-4 p-6">
        {Object.entries(LABELS).map(([key, label]) => (
          <div key={key}>
            <label className="sg-label mb-1 block">{label}</label>
            <input
              type={key === 'DISCOURSE_API_KEY' ? 'password' : 'text'}
              value={config[key] || ''}
              readOnly
              className={inputCls}
            />
          </div>
        ))}
      </div>

      <div className="sg-panel overflow-hidden p-0">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Automation Schedule</h2>
          <p className="mt-1 text-sm text-muted-foreground">Vercel cron times in UTC and Argentina time.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Job</th>
                <th className="px-4 py-3 text-left font-semibold">Endpoint</th>
                <th className="px-4 py-3 text-left font-semibold">UTC</th>
                <th className="px-4 py-3 text-left font-semibold">ARG</th>
                <th className="px-4 py-3 text-left font-semibold">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {AUTOMATION_SCHEDULE.map((item) => (
                <tr key={item.endpoint} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{item.job}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.endpoint}</td>
                  <td className="px-4 py-3 text-foreground">{item.utc}</td>
                  <td className="px-4 py-3 text-foreground">{item.arg}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Settings are read from server environment variables.</p>
    </div>
  );
}
