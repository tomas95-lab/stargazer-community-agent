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
AGENT_MIN_CONFIDENCE=0.72
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

`run-daily-thread.sh` is a generic wrapper for cron/launchd-style schedulers. The repository also includes explicit local job commands, but no deploy or cloud scheduler is configured here.

Local job commands:

```bash
npm run job:daily       # publish today's thread once unless FORCE_DAILY_PUBLISH=true
npm run job:webinars    # send webinar/onboarding reminders in the reminder window
npm run jobs:all        # reminders + daily publish only when DAILY_PUBLISH_ENABLED=true
```

The Community Agent checks only today's Argentina-day messages. It reads the public community chat, retrieves relevant snippets from `data/project-guidelines.txt`, and asks Claude whether to reply, ignore, or route to a human. Claude is instructed to answer only when the guideline/context supports the reply.

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
GET  /api/cron/community-agent
```

`POST /api/community-agent/run` accepts `{ "post": false }` for suggestions and `{ "post": true }` for auto-posting. Community-agent routes require `X-Admin-Token`.

The cron route is protected by `CRON_SECRET`. Vercel calls it every 90 minutes between 10:00 and 19:00 Argentina time using UTC schedules in `vercel.json`.

## Current Caveats

- `templates/*.md` duplicate the hardcoded templates in `src/templates.ts`; the code currently uses `src/templates.ts`.
- `Settings` is read-only because environment variables are managed outside the app.

## Verification

```bash
npm run build
npm --prefix ui run build
```
