# Linux preview runtime and fresh-profile smoke

Linux preview packages carry the Sidekick Python environment under
`resources/runtime/python`. The packaged app uses that environment even when
the shell that launched it exports `LASTBROWSER_WEBUI_PYTHON` or
`HERMES_WEBUI_PYTHON`. A missing bundled launcher is a packaging error; the
packaged app does not fall back to the host's `/usr/bin/python3`.

## Prepare and build offline

On a Linux x64 build host, first populate and verify the local Python wheelhouse
while internet access is available:

```sh
npm run prepare:python:online
```

This downloads the pinned wheels to `apps/desktop/runtime/wheelhouse-linux-x64`,
writes `SHA256SUMS.json`, installs the venv, and verifies the Sidekick imports,
including `uvicorn`. The wheelhouse is local build input and is not shipped.

After that preparation, the regular package command is offline for Python
dependencies. It uses `--no-index`, verifies the wheel hashes, and fails if a
required wheel is missing:

```sh
npm run package:linux
```

## Fresh-profile acceptance smoke

Run this on Linux x64 against the produced tar.gz. The smoke extracts the exact
archive into a temporary directory, imports `uvicorn` with the packaged
launcher, starts Lastbrowser with a new `--user-data-dir`, and waits for
Sidekick's `/health` response on port 8788. It sets both Python override
variables to `/usr/bin/python3` to reproduce the original failure condition and
prove the packaged app still uses its bundled venv. It terminates the app
process group when finished.

```sh
npm run smoke:linux:fresh-profile -- apps/desktop/release/Lastbrowser-0.1.56-x64.tar.gz
```

The test proves packaged Python and Sidekick startup in an isolated user
profile. It does not test live provider credentials or a release publication.
