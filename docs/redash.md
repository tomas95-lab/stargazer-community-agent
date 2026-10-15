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

Job polling uses expiring encrypted handles so it works across Vercel instances.
The page waits up to approximately 90 seconds, then directs you to Redash for
long-running jobs. Results are transient in the page and are not sent to Gemini
or Claude. Disconnect clears stored credential ciphertext. Removing a query
from this workspace does not archive its Redash query.

Redash must be reachable from the backend: internal-only/VPN access can prevent
Vercel from reaching it even when it works in your browser.

API reference: https://redash.io/help/user-guide/integrations-and-api/api/
