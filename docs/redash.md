# Private Redash diagnostics

The Diagnostics page is restricted to the authenticated Supabase identity
`b6f44318-a33e-4d01-958c-5d591d9267bc` with email
`tomas.ruiz@contractors.scale.com`. Project ownership, display names, and admin
tokens do not grant access. The server checks every request independently.

## Setup

1. Apply `supabase/redash.sql` in the Supabase SQL editor. This table has RLS
   enabled and grants no access to browser roles, including the owner.
2. Configure a dedicated `PLATFORM_ENCRYPTION_KEY` on the server. Use the
   existing deployment value if already configured; changing it invalidates
   existing encrypted credentials unless migrated. Redash refuses to store
   credentials without this variable, even though legacy encryption has fallbacks.
3. Sign in as Tomas, open Diagnostics, and enter a Redash User API key from
   the Redash profile. The server validates it before saving AES-256-GCM ciphertext.
   The raw key is never returned, stored in localStorage, or put in a URL.
4. Register an existing query ID, or create a query with its SQL. The server uses
   the sole available database or the database from your most recently updated
   Redash query. If neither can be determined, it asks you to first save a query
   in Redash rather than choosing an arbitrary database. Parameters are optional.
   Use an approved read-only database role;
   Redash/database permissions determine what SQL can execute.
5. Select the query and run it. Saved parameter defaults are loaded from Redash;
   optional JSON overrides support any query parameter, not just contributor IDs.
   The server requests a fresh execution. Results appear as a table.

No real diagnostic SQL is bundled: table names and eligibility rules must come
from the approved query/debugger. Evidence is not automatically interpreted as
an EQ reason. No contributor assignments or Community messages are changed.

### View saved SQL

In **Diagnostics > Diagnostic queries**, choose **View SQL** beneath a saved
query. The read-only panel loads the current SQL from Redash and supports
copying and reloading it without running or modifying the query. Closing the
panel clears its content from component state; SQL is not saved in localStorage.

`GET /api/redash/queries/:id/sql` uses the saved workspace ID, not an arbitrary
Redash query ID. It requires Tomas's exact authenticated ID and email, rejects
demo and admin-token access, and responds with `Cache-Control: no-store`.
Only SQL, local query metadata and parameter names are returned, never the
Redash credential, parameter defaults or cached query results. Other QMs cannot
gain access by joining the same project or navigating directly to the endpoint.

Job polling uses expiring encrypted handles so it works across Vercel instances.
The page waits up to approximately 90 seconds, then directs you to Redash for
long-running jobs. Results are transient in the page and are not sent to Gemini
or Claude. Disconnect clears stored credential ciphertext. Removing a query
from this workspace does not archive its Redash query.

Redash must be reachable from the backend: internal-only/VPN access can prevent
Vercel from reaching it even when it works in your browser.

API reference: https://redash.io/help/user-guide/integrations-and-api/api/

## Experimental account drafts

Diagnostics offers **Prepare diagnostic queries** and an opt-in checkbox per
project. The generated SQL is based on the schema inspected on data source 30.
Existing generic diagnostic templates are reused when available. No additional
Supabase migration is required: bindings are private metadata on saved queries.

The identity lookup checks the exact inferred email for `latam.coder<number>`:
`latam.coder<number>@remotasks.com+outlier`. It proceeds only when exactly one
record matches. It does not derive a user ID from the number or try other users'
email addresses mentioned in a message. Other username conventions need a
separate verified mapping before they can be diagnosed.

The status query binds the confirmed contributor ID and current Outlier project
ID. It joins project permissions and checks an unexpired project-specific user
throttle. Project emptiness is derived from `PROJECTS.TASKS_REMAINING`; this is a
warehouse snapshot, not a verified live queue. Confirm that this field matches
the project's operational meaning before using the draft. A quality-related
disabled flag uses a narrow reason-code allowlist and never discloses the raw
reason or quality score. Unknown reason codes remain generic access-review cases.

The two queries were syntax checked with fictitious IDs (status via EXPLAIN),
not validated against ground-truth EQ cases. Review their business semantics
against the internal debugger before enabling for a project.

EQ/account questions use the templates before the ordinary support answer path.
The output is always `action: human` plus `draftOnly: true`. Both Community and
DM automatic sending reject this flag. Returned drafts contain fixed English
wording built from an allowlist of boolean states. Raw SQL results, counts,
identity IDs, disable reasons and scores are never passed into Gemini/Claude.
Mismatched identities/projects, missing permissions, timeouts and ambiguous
records require QM review. Non-Tomas requests cannot enable this path; HTTP
authorization overrides any shared project's owner identity. Scheduled runs
may use it only for a Tomas-owned connection, and still cannot auto-send drafts.

To test locally: select a real project, prepare the queries, inspect them in
Redash, enable experimental drafts, then generate drafts in Community or DMs.
Preparing alone does not enable background lookups.

### Disclosure boundary

Diagnostic output is restricted to exact reviewed English messages:
generic QM review, access review, temporary limitation, an empty queue, or the
QM-approved Money Heist quality-reassignment explanation.
`sealDiagnosticDraft` reconstructs the public draft from scratch and drops all
extra fields, notes, internal reasons and evidence. Any different wording,
including appended text, is replaced by the generic review message. An
additional sensitive-pattern check rejects identifiers, digits, email addresses,
URLs and credential markers. Missing/non-boolean/contradictory state flags also
fall back to generic review. The support evaluator seals the result again before
returning it. Neither the model nor query-returned free text chooses the wording.

This boundary protects diagnostic-generated drafts. It does not certify every
other application workflow or text manually written by an operator as free of
sensitive data. Manual raw query results remain restricted to Tomas's private
Diagnostics page.
