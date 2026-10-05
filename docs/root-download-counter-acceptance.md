# Download counter acceptance

The browser counter now displays only the public release asset sums returned by the same-origin `/api/download-count` endpoint. Download-link clicks do not change the displayed total or local cache: a click can be cancelled, blocked, or fail and cannot prove a successful download. The browser no longer requests GitHub directly.

The short-lived browser cache is only a request optimization. If the same-origin refresh fails, a previously observed count is shown as `stale` with its original observation time; if there is no cached observation, the UI shows `unavailable`. An explicit API `unavailable` response follows the same stale-if-known behavior. Only successful `ready` API responses update the local cache.

The previous implementation persisted click-inflated `setup`/`total` counts in `lb_dl_count_cache_v1`, while preserving a syntactically valid total. The browser now reads only `lb_dl_count_cache_v2`; the old key is ignored so a plausible but locally inflated value cannot reappear as stale.

Focused offline coverage checks repeated setup and portable link clicks, fresh local cache behavior, stale cache after network errors, cold unavailable/error behavior, legacy click-inflated v1 cache rejection, and that requests stay on the same-origin endpoint. Existing server tests continue to cover authoritative aggregation, pagination, cache coalescing, and upstream failure semantics. The original focused set passed 14/14; after adding the v1-cache migration regression, the final suite passed 15/15.

Run from the repository root:

```powershell
node --test lastbrowser.com/tests/download-counter.test.mjs
```

This is local deterministic test evidence only. No website was published and no public count was fetched during this change.
