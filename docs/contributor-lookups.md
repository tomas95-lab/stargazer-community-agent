# Private contributor lookups v2

`src/contributor-lookups.ts` contains 13 parameterized investigation queries.
They are separate from the automatic diagnostic bindings: registering or running
them does not enable the agent or post messages.

Run with `node --import tsx scripts/investigate-contributor.ts latam.coder779`.
An optional second argument selects a lookup, e.g. `12`; identity always runs
first. The script uses Tomas's configured active project and its real project
key, never a contributor's guessed project. This investigation selected Money
Heist, the only enabled project in Tomas's configuration.

Identity uses a small list of exact candidate addresses from the username
convention. Zero or multiple matches stop the investigation. Emails and user IDs
remain inside the runner; output contains allowlisted aggregate signals only.
All person-specific follow-up queries filter the verified ID and configured
project, except the explicitly labelled account-wide onboarding block. Query 13
is intentionally project-wide.

## Interpretation limits

- A priority association is not proof of a current assignment.
- A permission record is not a guarantee of eligibility or task serving.
- Missing records and null values are unknown, not a clean account status.
- Disablements, throttle views and warehouse snapshots can lag live systems.
- Quality lookup reveals only evidence availability, never a score or rating.
- EQ and task-limit events are historical signals with a 24-hour window.
- Course completion records do not prove every required course was completed.
- Assignment events show recent moves into the project, not every move away.
- Tag presence does not establish throttle, quality, or disablement. When a
  prefix is derived from the configured project name rather than an explicit
  setting, it is labelled unverified and cannot support a diagnostic conclusion.
- Queue query returns both layers even when there are no pending nodes. It
  describes pending/unclaimed nodes, not guaranteed task availability for an
  individual. Layer-to-role mapping and other eligibility gates need validation.

Do not pass raw view results, names, reasons, tags, scores, staffing priorities,
operator identities, or numeric task inventory into the model. The script's
summary function rejects additional fields and unknown free text. Diagnostic
drafts remain subject to the separate closed disclosure policy.
