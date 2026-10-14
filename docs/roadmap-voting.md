# Public roadmap voting

## Scope

Public, account-free upvotes on the six existing goals, Composio and 24 approved
integrations. Shared totals are stored in Cloudflare D1, not localStorage.
Visitors can select multiple favorites and withdraw votes. Anonymous browser
identity is best-effort; clearing cookies or changing devices can create another
identity. This is a prioritization signal, not a verified-person election.

## Deployment

1. Create a dedicated Cloudflare D1 database and apply
   `docs/roadmap-voting-schema.sql`. Do not expose SQL as a public website asset.
2. Bind it as `ROADMAP_DB` to the existing Pages project.
3. Set `ROADMAP_VOTE_SECRET` as a secret: at least 32 randomly generated
   characters. Never include its value in source, commands printed to logs,
   browser assets, or chat messages.
4. Use separate database and secret for preview. Redeploy Pages Functions and
   assets together; retain the existing download proxy/counter functions.
5. Update all translated roadmap pages: include the voting stylesheet/module,
   translated explanatory/status text, and stable `data-roadmap-id` attributes
   on the feature heading or list label. The German page also matches canonical
   labels automatically. IDs are in `assets/js/roadmap-catalog.js`.
6. Update translated privacy pages with the limited functional-cookie purpose,
   random pseudonymous ID and vote records, one-year expiry and no marketing use.

Anker owns website integration/deployment. Publication is explicitly authorized
by the user's request. Root has not confirmed a deployed D1 binding or live votes.

## Data and behavior

- GET returns shared totals and the requesting browser's selected IDs, with
  private/no-store caching. GET does not set a cookie.
- First click creates a signed Secure/HttpOnly/SameSite cookie, max age one year.
  The cookie is not accessible to JavaScript. D1 stores random ID, feature ID and
  expiry, never an email address, IP address or browser fingerprint.
- PUT sets a desired boolean vote state. A composite primary key prevents
  repeated requests from counting twice. DELETE behavior is represented by
  `voted: false`; the endpoint only permits the fixed feature allowlist.
- Mutations require same-origin Origin, JSON and a custom request header.
  Request bodies are limited to 1 KiB; signed cookie identity is mandatory for
  voting. No credentialed cross-origin access is enabled.
- A database counter limits each signed browser identity to 60 changes/minute.
  This is not strong bot protection: cookie recreation bypasses that bound.
  Configure edge rate limits or a challenge if abuse occurs; no person-level
  uniqueness or comprehensive anti-fraud protection is claimed.
- Votes count only until cookie expiry. Successful mutations purge expired vote
  rows and old rate-limit rows. For deletion independent of traffic, schedule
  daily SQL cleanup in the hosting environment.
- UI displays unknown/unavailable instead of invented totals when the database
  is not configured. Failed mutations do not increment the visible count;
  persisted state is refreshed after uncertain network outcomes.
- Locale pages share the same IDs and database, so votes are not split by language.

## Evidence

Implementation only. No test suite, account connection, database provisioning or
live voting verification was performed by Root in this change. Syntax checks
are separate from runtime/D1 acceptance.

References:
- https://developers.cloudflare.com/pages/functions/bindings/
- https://developers.cloudflare.com/d1/sql-api/sql-statements/
