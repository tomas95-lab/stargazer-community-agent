# Private draft preview

Tomas can use Diagnostics > Test a contributor draft to enter a Community
username and an EQ/account-status message. The active project ID comes from the
authenticated workspace context. The request cannot override it. Preparing or
updating the queries binds version 2 to that project but leaves diagnostics
disabled. Preview works while background diagnostics are disabled.

The test starts with an exact identity lookup, checks the project account state
and project-scoped tags, then returns only a sealed draft. Read-only Redash jobs
are polled in separate requests. Expiring encrypted session tokens bind owner,
project and progress; they do not contain an API key. No messages are posted,
no processed-message state changes, and raw results are never sent to the AI.

## Tag explanations

`src/project-tag-policy.ts` retains the ten Money Heist tag explanations from
the supplied query pack as private reference text, including descriptions not
present in Redash. Their meanings have been confirmed by the Money Heist QM.
The raw descriptions are never returned by the preview API or passed
to an AI prompt. Their numbers, thresholds and reviewer levels cannot enter the
sealed draft.

Rules are scoped to the configured Outlier project ID. Checks apply to every
uniquely resolved contributor, never a hardcoded username. Trusted and course
tags do not imply disablement. The QM-confirmed Money Heist disabled tag means
quality reassignment and removal of project task access. This specific cause
has an allowlisted contributor-facing draft; it is not applied to other projects.
Throttle and course tags are hints requiring independent corroboration. A
project with no known mapping or unknown tags gets a generic review draft;
it is never told it is clear or enabled based on absence of a known tag.

The existing read-only lookup suite may search a project-name-derived prefix
as an explicitly unverified investigation hint; the automated draft path uses
only the project-ID-bound tag policy.

Run a private backend smoke test with:

`node --import tsx scripts/test-diagnostic-draft.ts latam.coder779 "I am EQ"`

This updates private query templates and bindings but keeps experimental
diagnostics disabled. It prints only the approved draft and coarse progress.
