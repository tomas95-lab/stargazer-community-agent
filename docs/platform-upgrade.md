# Platform hardening upgrade

The application now checks whether the required platform schema is available through `GET /api/platform/status`.

## Database migration

Before deploying this version, run the complete `supabase/schema.sql` file in the Supabase SQL Editor for project `rndtofonkdelbspwhzjr`.

The migration is additive and keeps existing projects and encrypted credentials. Existing disabled projects are migrated to `paused`, so Stargazer remains paused.

The migration adds:

- project roles, lifecycle status, settings, and recoverable archives;
- immutable project audit events;
- atomic automation run locks;
- operation and AI usage events;
- review queue state and scheduled messages.
- project content storage for topics, comms, links, webinars, guidelines, memory, and output markers.

After running it, confirm that `/api/platform/status` returns `"schemaReady": true`.

## Required environment

Set a dedicated `PLATFORM_ENCRYPTION_KEY` with at least 32 random bytes. Keep the previous encryption secret available until all existing secrets have been re-encrypted.

Set `FRONTEND_BASE_URL` and `CORS_ALLOWED_ORIGINS` to the production application URL.

## Release order

1. Apply `supabase/schema.sql`.
2. Verify `schemaReady` locally.
3. Deploy the application.
4. Verify Stargazer is still `paused` in Projects.
5. Run read-only Health Center checks before enabling any project.

## GitHub data migration

Keep the legacy `DATA_STORE=github` while preparing the database. After applying the schema, run:

```bash
npm run storage:migrate -- --source=github
npm run storage:migrate -- --source=github --apply
npm run storage:verify -- --source=github
```

The first command is a dry run, the second copies and verifies every eligible file, and the third confirms that Supabase matches GitHub. The migration is idempotent and does not modify or delete the source repository.

After verification, remove `DATA_STORE`, set `STORAGE_BACKEND=supabase`, deploy, and check `/api/platform/status`. Keep `STORAGE_FALLBACK=github` for at most the first observation window. Then remove the fallback and the `GITHUB_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` environment variables.

Rollback is configuration-only: set `STORAGE_BACKEND=github`. Supabase writes do not delete the legacy source during migration.
