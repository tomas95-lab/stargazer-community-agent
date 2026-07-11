# Daily Thread Bot - Stargazer Community

Internal community-management toolkit for Stargazer Axiom. It generates daily threads, publishes them to Outlier Community through the Discourse API, posts chat announcements, manages comms templates, and stores operational data in GitHub.

## What It Does

- Generates daily thread markdown from `data/topics.json`.
- Publishes threads to Discourse with `DISCOURSE_API_KEY`.
- Posts daily announcements and custom comms to the community chat.
- Manages topics, sessions/webinars, links, templates, and history through a React dashboard.
- Writes an operation log for publishes, chat sends, reminders, and data edits.
- Exposes community actions through an MCP server.
- Includes a Claude-powered community agent for today's chat messages.
- Reviews today's direct-message threads and can auto-reply to safe DMs with the same Claude filters as Community.
- Sends browser notifications from the dashboard when new Community or DM items are detected.

## Project Shape

| Path | Purpose |
|---|---|
| `src/` | Core bot logic, templates, Discourse API wrapper, MCP tools, jobs |
| `server/` | Express API used locally by the UI |
| `api/` | Vercel serverless entrypoint |
| `ui/` | React/Vite dashboard |
| `data/` | JSON data plus extracted project guideline text |
| `output/` | Generated files and publish history |
| `scripts/` | Shell helpers |

## Setup

```bash
npm install
cd ui
npm install
cd ..
cp .env.example .env
```

Fill `.env` with Discourse and GitHub credentials.

Required for publishing:

```bash
ADMIN_TOKEN=...
DISCOURSE_API_KEY=...
DISCOURSE_API_CLIENT_ID=daily-thread-bot
COMMUNITY_BASE_URL=https://community.outlier.ai
COMMUNITY_CATEGORY_ID=15895
COMMUNITY_CHAT_CHANNEL_ID=828853
```

Required for the web API data store:

```bash
DATA_STORE=github
GITHUB_TOKEN=...
GITHUB_OWNER=tomasruiz653
GITHUB_REPO=community_bot
```

Optional:

```bash
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-haiku-4-5
CRON_SECRET=...
AGENT_AUTO_POST=false
AGENT_MAX_ANSWERS=4
AGENT_MESSAGE_COUNT=50
AGENT_MIN_CONFIDENCE=0.50
DM_REVIEW_MESSAGE_COUNT=50
DM_REVIEW_MAX_CHANNELS=5
DM_REVIEW_REQUEST_DELAY_MS=1500
DM_AUTO_REPLY=true
DM_AUTO_REPLY_MAX=3
DISCOURSE_RATE_LIMIT_RETRIES=2
DISCOURSE_RATE_LIMIT_MAX_WAIT_SECONDS=30
DAILY_PUBLISH_POST_CHAT=true
SERVER_PORT=3001
```

## Daily Thread CLI

Dry run:

```bash
npm run daily -- --dry-run
```

Publish:

```bash
npm run daily -- --publish
npm run daily -- --publish --yes
```

The CLI uses the Discourse API. It does not open a browser or require a browser profile.

## Web UI

Run the API and UI during development:

```bash
npm run server
npm run ui:dev
```

Or use the combined script:

```bash
npm run dev
```

Vite proxies `/api` to `http://localhost:3001`.

Protected actions require an admin token. Set `ADMIN_TOKEN` on the server, then open the UI Settings page and save the same token locally in your browser. The token is sent as `X-Admin-Token` for publish, send, sync, create, update, and delete actions.

Build the UI:

```bash
npm run ui:build
```

Run tests:

```bash
npm test
```

## Data Model

`DATA_STORE` controls where JSON data is read and written:

- `github`: use GitHub through `GITHUB_TOKEN`.
- `local`: use files in this checkout.
- `auto`: use GitHub when `GITHUB_TOKEN` exists, otherwise local files.

`data/topics.json` is the daily thread calendar. The publisher chooses the topic whose `date` matches today. If no exact match exists, the CLI falls back to the first topic.

`data/webinars.json` stores webinar/onboarding sessions. `src/webinar-reminder.ts` sends reminders for sessions starting 45-75 minutes from now.

`data/comms-templates.json` stores reusable message templates for the comms dashboard and CLI.

`data/links.json` stores editable project links used by the daily thread renderer.

`data/project-guidelines.txt` is extracted from `project_guidelines.pdf` and used as the Claude agent knowledge base.

`output/operations-log.json` stores recent operational events such as publishes, chat sends, reminders, and data edits.

`output/community-agent-state.json` tracks processed community chat items so the scheduled agent does not answer the same message twice.

## Automation

`run-daily-thread.sh` is a generic wrapper for cron/launchd-style schedulers. The repository also includes explicit local job commands and Vercel cron routes for production automation.

Local job commands:

```bash
npm run job:daily       # publish today's weekday thread once unless FORCE_DAILY_PUBLISH=true
npm run job:dms         # review today's incoming direct messages
npm run job:webinars    # send webinar/onboarding reminders in the reminder window
npm run jobs:all        # reminders + daily publish only when DAILY_PUBLISH_ENABLED=true
```

The Community Agent checks only today's Argentina-day messages. It reads the public community chat, retrieves relevant snippets from `data/project-guidelines.txt`, and asks Claude whether to reply, ignore, or route to a human. Claude is instructed to answer only when the guideline/context supports the reply.

The DM review job checks up to 5 active direct-message channels and stores today's full DM thread timeline from the current Argentina day in `output/dm-review-YYYY-MM-DD.json`. When `DM_AUTO_REPLY=true`, it can auto-reply to safe pending DMs using the same Claude filters as the Community Agent. The UI can still ask Claude for a draft reply per DM thread and send replies manually.

The header bell enables browser notifications on the current Mac. Notifications are triggered from `output/operations-log.json` when the agent finds new Community candidates, posts an automatic Community reply, or detects new DM message IDs. The dashboard must be open in the browser for this no-cost local notification mode.

Refresh the guideline text after replacing the PDF:

```bash
npm run guidelines:extract
```

Manual agent run:

```bash
npm run ai:respond
npm run ai:respond -- --post
```

Use `--post` only when you want it to send safe replies to chat.

The same agent is available through protected API routes:

```text
GET  /api/community-agent/messages?count=20
GET  /api/community-agent/overview
POST /api/community-agent/run
GET  /api/dm-review
POST /api/dm-review/run
POST /api/dm-review/draft
POST /api/dm-review/reply
GET  /api/operations
GET  /api/cron/daily-thread
GET  /api/cron/community-agent
GET  /api/cron/dm-review
```

`POST /api/community-agent/run` accepts `{ "post": false }` for suggestions and `{ "post": true }` for auto-posting. Community-agent routes require `X-Admin-Token`.

The cron routes are protected by `CRON_SECRET`.

Vercel calls `/api/cron/daily-thread` Monday-Friday at 10:00 and 11:00 Argentina time. The second run is a retry window: `runDailyPublishJob` checks `output/published-url-YYYY-MM-DD.txt` first and skips when today's thread was already published. On Hobby plans, Vercel may invoke cron jobs at any point within the configured hour, so the retry intentionally lives in the next hour.

`runDailyPublishJob` also has a backend weekend guard. If a scheduler calls the endpoint on Saturday or Sunday in Argentina, the job skips with `reason: "weekend_argentina"`. Set `FORCE_DAILY_PUBLISH=true` only for a manual emergency publish.

For production cron, use `DATA_STORE=github` with `GITHUB_TOKEN` so the publish marker persists between serverless runs. The job also checks the Community category for an existing daily-thread title before publishing, which prevents duplicate posts if the marker file is missing.

Vercel calls `/api/cron/community-agent` roughly every 90 minutes between 10:00 and 19:00 Argentina time using UTC schedules in `vercel.json`.

Vercel calls `/api/cron/dm-review` at 15:30 and 18:00 Argentina time. The job filters by the current Argentina day, so older DMs remain available for endpoint verification but are not included in the daily report. If `DM_AUTO_REPLY=true`, safe DMs are answered automatically with the same confidence, guideline, English-only, sensitive-topic, and signature checks used by the Community Agent. DM drafts are still available through `/api/dm-review/draft`, and manual replies are sent from the UI via `/api/dm-review/reply`.

Production cron schedule:

| Job | Endpoint | UTC | ARG |
|---|---|---:|---:|
| Daily Thread | `/api/cron/daily-thread/1000` | 13:00 Mon-Fri | 10:00 Mon-Fri |
| Daily Thread retry | `/api/cron/daily-thread/1100` | 14:00 Mon-Fri | 11:00 Mon-Fri |
| Community Agent | `/api/cron/community-agent/1000` | 13:00 | 10:00 |
| Community Agent | `/api/cron/community-agent/1130` | 14:30 | 11:30 |
| Community Agent | `/api/cron/community-agent/1300` | 16:00 | 13:00 |
| Community Agent | `/api/cron/community-agent/1430` | 17:30 | 14:30 |
| Community Agent | `/api/cron/community-agent/1600` | 19:00 | 16:00 |
| Community Agent | `/api/cron/community-agent/1730` | 20:30 | 17:30 |
| Community Agent | `/api/cron/community-agent/1900` | 22:00 | 19:00 |
| DM Review | `/api/cron/dm-review/1530` | 18:30 | 15:30 |
| DM Review | `/api/cron/dm-review/1800` | 21:00 | 18:00 |

External scheduler setup:

`cron-job.org` can mirror the production schedule and call the same protected cron endpoints. Add `CRON_JOB_ORG_API_KEY` to `.env`, keep `CRON_SECRET` set, then run:

```bash
npm run scheduler:setup:cron-job-org
```

To preview the jobs without creating or updating anything:

```bash
npm run scheduler:setup:cron-job-org -- --dry-run
```

The setup script creates a `Stargazer Community Agent` folder, upserts the daily thread, community agent, and DM review jobs, and sends `Authorization: Bearer <CRON_SECRET>` on every request.

## Current Caveats

- `templates/*.md` duplicate the hardcoded templates in `src/templates.ts`; the code currently uses `src/templates.ts`.
- `Settings` is read-only because environment variables are managed outside the app.

## Verification

```bash
npm run build
npm --prefix ui run build
```
