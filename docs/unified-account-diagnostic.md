# Unified contributor diagnostic (v3)

The experimental Redash diagnostic now uses one SQL execution per contributor
and configured project. It resolves the exact supported email candidates inside
the same query. No result is produced for ambiguous identities. The project ID
comes from authenticated project context, never the contributor's message.

## Evidence

- Latest non-deleted permission record, project tags and excluded-tag membership.
- Individual queue snapshot and its observation date.
- Pending, unclaimed project tasks and tasks on the contributor's review layer.
  These signals describe queue inventory, not a promise of individual eligibility.
- Active throttle, start/expiration, role-scoped submissions in 24/72 hours.
- Attempt/rating history over 365 days; one latest QMS rating per attempt.
- Overall QMS/PDR and distribution, separate from the last-three attempter or
  last-two reviewer ratings. Recent means latest QMS update order.
- Current normalized bucket, expected performance bucket, mismatch indicator,
  configured task limit/window, and primary diagnosis. Other evidence stays
  available even when there is a primary cause.

## Lifecycle

The experimental Money Heist policy uses the rules confirmed by the QM:
new 1/24h; untrusted 1/72h; normal 1/24h; trusted 6/24h. Reviewer task limits are
unspecified. Legacy tag names are normalized where their meaning matches a
defined bucket; unknown tags are not assigned invented limits.

Defects are scores 1 or 2. Threshold comparisons use integer defect counts for
one-third boundaries, not rounded PDR. Attempter precedence is disable/untrusted,
promote, trusted, normal. Reviewer precedence is demote, untrusted, trusted.
Insufficient ratings remain new; uncovered conditions return null. Multiple
bucket tags are flagged; a mismatch is a recommendation, not an applied action.

## Drafts and migration

Gemini receives an explicit projection of diagnostic fields, without raw tags,
email, contributor ID or project ID. Scores, averages, PDR and confirmed limits
are allowed. The model receives overall and gate averages separately. Normal
usage reservations/accounting and provider fallback remain in effect.

The generated reply is not restricted to the old canned-response catalogue.
Preview routes always return `human`, `draftOnly: true`. For real Community/DM
evaluations, confirmed diagnoses may become `reply` only when the current
connection belongs to Tomas, authenticated/runtime diagnostics authorization is
present, the project is active, and its v3 binding explicitly enables both
diagnostics and automatic replies. This is rechecked server-side before the
decision is promoted. Other QMs sharing the project cannot use this permission.
Unresolved cases, errors and invalid model output remain human-reviewed drafts.
Existing Community/DM posting switches still apply. QM explanations stay separate
from sent text. No permissions, tags or assignments are changed.

Prepare/Update unified query creates or updates a project-bound v3 query and
leaves experimental automation disabled. Testing works while it is disabled.
Existing v2 identity/status SQL and lookup queries remain available for rollback.
Enabling v3 only enables the unified binding, not legacy bindings. An additional
Tomas-only automatic-reply switch controls sending; query updates reset both
switches. Old pending
v2 handles can finish. Do not delete old queries until v3 testing is accepted.

Cleanup completed with QM approval on 2026-10-15: the 15 previous experimental
queries (identity/status and 13 lookup queries) were archived in Redash and their
16 registry references removed. Only unified query 388762 remains in Tomas's
registry. No warehouse data or contributor access was modified. Redash archive
entries remain recoverable; the local legacy code is not an active binding.

Verification (read-only, no AI calls):

```powershell
node --import tsx scripts/verify-unified-account-query.ts latam.coder779
```

Add `--register` to register validated SQL and disable project diagnostic
bindings. Run only with the QM's authorization; credentials remain server-side.
