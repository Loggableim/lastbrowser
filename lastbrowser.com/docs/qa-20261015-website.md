# Website QA · 2026-10-15 (Anker)

## Priority fix (done in this PR)

- **Broken showcase image** `store-screen-1-sidebar-spaces.png` / `-de.png`: removed right-hand mockup overflow (“Local First DPAPI” panel) via crop + center pad to 1920×1080; added `.webp` variants.
- **Mobile showcase**: hide crowded titlebar mock on narrow viewports; `object-fit: contain` + `max-height: 52vh` on showcase image.
- **Alt text**: localized descriptive alts on all 7 homepages (de root + en/es/fr/it/pt/ja).

## Locale homepages (manual + static review)

| Locale | Showcase PNG/WebP | Alt text | Notes |
|--------|-------------------|----------|-------|
| de | `-de.png/.webp` | updated | |
| en | `.png/.webp` | updated | |
| es/fr/it/pt/ja | `.png/.webp` | updated | Shared EN UI screenshot until localized captures land |

## Version & download (spot check)

- Site copy references **v0.1.55 Beta** on download pages (not v0.1.56). Align with next release PR when 0.1.56/0.1.57 is published.
- Linux preview keys present under `assets/keys/SHA256SUMS-linux-0.1.56`; marketing version strings still 0.1.55 — **intentional until release comms update**.

## Open / follow-up

- Full **8 areas × 7 locales** app screenshots (in progress; only `en` raw set complete).
- Remaining legacy `store-screen-*.png` carousel slides not yet replaced (sidebar priority only).
- Press page still links older zen sidebar PNG.

## Desktop vs mobile

- CSS fixes target `<900px` breakpoint used sitewide; recommend visual pass on real devices after deploy preview.
