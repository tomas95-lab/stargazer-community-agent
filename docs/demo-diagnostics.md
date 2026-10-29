# Testing workspace: Quality and Diagnostics

The existing testing account receives fictional Aurora metrics in Quality for
14, 30 and 60 days. Data is generated relative to the current date, without
seeding production logs, reading usage records or modifying project data.

Diagnostics has a separate demo page and `/api/demo-diagnostics` API. It requires
an authenticated account marked `app_metadata.demo_account = true` and an active
project with `settings.demoMode = true`. These flags are resolved server-side.
Changing request body flags cannot unlock the demo or real Redash.

Eight synthetic contributor profiles cover 1/24h, 1/72h and 6/24h limits, quality
reallocation, reviewer demotion, project EQ and healthy access. Tests show the
simulated evidence, a contributor draft and a QM explanation. Only usernames
from the fixed fictional list are accepted. Follow-up and score questions have
deterministic demo responses; this is not a live Gemini evaluation.

No API keys, SQL execution, AI requests, token consumption or sends are used by
these two demo features. Existing non-demo Quality and Tomas-only Redash access
are unchanged. Both demo views visibly label their data as simulated.

Local end-to-end API check (uses existing testing login, no credential changes):

```powershell
node --import tsx scripts/verify-demo-workspace.ts
```
