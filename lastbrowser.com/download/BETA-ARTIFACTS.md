# Beta 0.1.57-demo.4 — public download hosting

Website links (after deploy + upload):

- `https://lastbrowser.com/downloads/beta/Lastbrowser-0.1.57-demo.4-x64-setup.exe`
- `https://lastbrowser.com/downloads/beta/Lastbrowser-0.1.57-demo.4-x86_64.AppImage`

Cloudflare Pages Function: `functions/downloads/beta/[file].js` serves objects from R2 bucket **`lastbrowser-beta-downloads`** (binding `BETA_DOWNLOADS` in `wrangler.toml`).

## Upload keys (must match exactly)

| R2 object key | File | SHA-256 | Notes |
| --- | --- | --- | --- |
| `beta/Lastbrowser-0.1.57-demo.4-x64-setup.exe` | Windows setup | `b0ed565e72eb49ded0fc1e3dc8c8643b83e3a6a6d3c7eb24b3415b6b96aeb319` | Authenticode via Nord (SimplySign); replace unsigned bytes in place |
| `beta/Lastbrowser-0.1.57-demo.4-x64-portable.exe` | Windows portable | `a19ce435c62b5a016ac458c70f08cddeac5674d27f9ebb5df2247d309941ab6d` | Not linked on the website; upload for parity |
| `beta/Lastbrowser-0.1.57-demo.4-x86_64.AppImage` | Linux AppImage | `4d6080c9f0cb044effd2376928333d17c092ceece374bbdfe737e1ba7a175870` | Build commit `77006141` on `lastbrowser/demo4-ship-b614` |

Example (after `wrangler login`):

```bash
wrangler r2 object put lastbrowser-beta-downloads/beta/Lastbrowser-0.1.57-demo.4-x86_64.AppImage \
  --file=/path/to/Lastbrowser-0.1.57-demo.4-x86_64.AppImage

wrangler r2 object put lastbrowser-beta-downloads/beta/Lastbrowser-0.1.57-demo.4-x64-setup.exe \
  --file=/path/to/signed/Lastbrowser-0.1.57-demo.4-x64-setup.exe
```

Unsigned Windows sources (build machine, commit `77006141`):

- `/tmp/lb-win-ship/apps/desktop/release/Lastbrowser-0.1.57-demo.4-x64-setup.exe`
- `/tmp/lb-win-ship/apps/desktop/release/Lastbrowser-0.1.57-demo.4-x64-portable.exe`

No Git tag, no GitHub Release for this beta line. Stable v0.1.56 GitHub assets stay unchanged.
