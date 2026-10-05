# Public download counter

The counter sums GitHub's `download_count` for `Lastbrowser-<version>-x64-setup.exe` and `Lastbrowser-<version>-x64-portable.exe` across every public release, including published prereleases. Drafts, archives, metadata, unrelated executables, Microsoft Store downloads and installation estimates are excluded. Removed/replaced release assets cannot be reconstructed; this is the current public asset total, not a lifetime unique-user metric.

The seven landing pages and seven download pages fetch `/api/download-count` on the same origin. The Cloudflare Pages Function uses anonymous server-side GitHub requests; browser cookies, IP headers, referrers and visitor IDs are never forwarded. No analytics events, credential or tracking database is introduced. It paginates all release pages, refuses partial/invalid results, and bounds collection to ten pages and ten seconds. The UI does not contact GitHub directly, so browser CORS does not depend on GitHub policy and the existing same-origin CSP permits the request. Clicking a download link is not evidence that a file was downloaded and never increments the public count.

Cloudflare Cache API retains a successful observation for up to one day; values are fresh for five minutes. Concurrent refreshes in an isolate are coalesced. Failures retain a dated value marked stale, or return unavailable with a null count. Failed refreshes are cached with a backoff respecting GitHub's rate-limit reset and Retry-After. Cache scope is each Cloudflare location; an anonymous shared-IP limit can still make the source unavailable. No zero is substituted for missing data. The browser uses a short-lived local cache only to avoid repeat requests; after an API error, an older cached observation is displayed as stale with its original observation time, or the count is unavailable if no observation exists. The cache key is versioned so counts persisted by the former click-increment logic are discarded. Browser values and dates use `Intl` formatting for de/en/es/fr/it/pt/ja.

Official references verified on 2026-10-04:

- [GitHub releases and asset download counts](https://docs.github.com/en/rest/releases/releases)
- [GitHub anonymous rate limits and backoff](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/api-reference/)

Offline verification, from repository root:

```powershell
node --test lastbrowser.com/tests/download-counter.test.mjs
node lastbrowser.com/tests/serve-download-counter.mjs
```

The local server reports a loopback URL and serves an explicit deterministic fixture (15,456 test downloads). These are not actual public counts. Add `--live` to read the real public source through the production function. No authentication or install is needed.

Production must deploy from `lastbrowser.com/` with its adjacent `functions/` directory, as the existing download proxy does. Static-only hosting returns an unavailable counter, rather than inventing a value. This change does not publish or alter the release/download targets. Test scripts are developer helpers and need not be uploaded as public static assets.
