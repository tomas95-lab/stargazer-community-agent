# Daily Thread Bot — Stargazer Axiom

Automation tool for publishing daily threads to Outlier Community and generating announcement messages.

## Install

```bash
cd daily-thread-bot
npm install
npx playwright install chromium
cp .env.example .env
```

## Usage

### Dry run (no browser, no publish)

```bash
npm run daily -- --dry-run
```

Generates thread and announcement files in `output/` without opening a browser.

### Publish

```bash
npm run daily -- --publish
npm run daily -- --publish --yes   # skip confirmation
```

Opens a browser, fills the thread, publishes, captures the URL, and generates the announcement.

## First-time login

1. Run `npm run daily -- --publish`
2. The browser opens with a persistent profile stored in `.browser-profile/`
3. Log in manually (handle 2FA if needed)
4. The bot waits for you to reach the new-topic page
5. Next runs will reuse the session automatically

## Update daily topics

Edit `data/topics.json`. Each entry has:

```json
{
  "date": "2026-07-01",
  "title": "...",
  "topic": "...",
  "reminderTitle": "...",
  "reminderBody": "...",
  "goodExample": "...",
  "badExample": "...",
  "quickRule": "...",
  "webinar": {
    "enabled": false,
    "mandatory": true,
    "timeLabel": "12:00 PM ARG",
    "link": "https://..."
  }
}
```

If no entry matches today's date, the first entry is used as fallback.

## Update selectors

If the Community UI changes, edit selectors in `src/config.ts`:

```ts
export const selectors = {
  titleInput: '...',
  bodyInput: '...',
  createTopicButton: '...',
  categoryDropdown: '...',
  categoryOption: (id: string) => `...`,
};
```

When a selector fails, the bot saves a screenshot and HTML dump in `output/` to help debug.

## Environment variables

| Variable | Description |
|---|---|
| `HEADLESS` | `true` for headless, `false` for headed (default) |
| `SLOW_MO` | Milliseconds between actions (default: 50) |
| `COMMUNITY_NEW_TOPIC_URL` | URL for the new topic page |
| `COMMUNITY_CATEGORY_ID` | Optional category ID to auto-select |
| `BROWSER_PROFILE_PATH` | Path to persistent browser profile |

## Security

These paths are gitignored and should never be committed:

- `.env` — environment config
- `.browser-profile/` — browser session data
- `output/*.md`, `output/*.txt` — generated content
- `output/*.png`, `output/*.html` — error captures
