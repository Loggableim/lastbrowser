# Linux preview runtime and fresh-profile smoke

Linux preview packages carry a relocatable CPython 3.12 prefix under
`resources/runtime/python`. It is the pinned `python-build-standalone`
`install_only` archive, with Sidekick's wheels installed into that prefix.
It is not a venv, and it does not read `/usr/lib/python3.12` from the build
host. The packaged app uses that environment even when the shell that launched
it exports `LASTBROWSER_WEBUI_PYTHON` or `HERMES_WEBUI_PYTHON`. A missing
bundled launcher is a packaging error; the packaged app does not fall back to
the host's `/usr/bin/python3`.

The normal Linux start does not install or require a host `libfuse2` package.
`apps/desktop/release/run-linux-preview.sh` is the command to run. It sets
`APPIMAGE_EXTRACT_AND_RUN=1` and, when the package step found `libfuse.so.2`
on the build host, points `LD_LIBRARY_PATH` at the bundled copy beside the
launcher. That launcher does not replace the bundled Python interpreter.

## Prepare and build offline

Run this only from the final v0.1.56 source head on a Linux x64 build host. The
repository's version and source commit must be checked before building; a
preparation branch based on an earlier version is not a v0.1.56 release build.
First populate and verify the local Python wheelhouse while internet access is
available:

```sh
npm run prepare:python:online
```

This downloads the pinned wheels to `apps/desktop/runtime/wheelhouse-linux-x64`,
writes `SHA256SUMS.json`, downloads the pinned python-build-standalone
tarball, installs that prefix, and verifies the Sidekick imports, including
`uvicorn` and `encodings` from the prefix rather than `/usr`. The wheelhouse
and the standalone tarball are local build input and are not shipped.

After that preparation, the regular package command is offline for Python
dependencies. It uses `--no-index`, verifies the wheel hashes, and fails if a
required wheel is missing. It produces both a tar.gz archive and an AppImage:

```sh
npm run package:linux
```

For v0.1.56, the expected x64 outputs are
`Lastbrowser-0.1.56-x64.tar.gz` and `Lastbrowser-0.1.56-x64.AppImage` in
`apps/desktop/release/`. The packaging step writes `SHA256SUMS` for both
artifacts and `SHA256SUMS.gpg-command`, which contains the suggested detached
signature command. Verify artifact hashes with:

```sh
cd apps/desktop/release
sha256sum -c SHA256SUMS
```

The command file is preparation only. A real detached signature such as
`SHA256SUMS.asc` must be created by the release owner with the authorized GPG
key; do not publish a placeholder signature.

## Fresh-profile acceptance smoke

Run this on Linux x64 against the produced tar.gz. The smoke extracts the exact
archive into a temporary directory, imports `uvicorn` with the packaged
launcher, starts Lastbrowser with a new `--user-data-dir`, and waits for
Sidekick's `/health` response on port 8788. It sets both Python override
variables to `/usr/bin/python3` to reproduce the original failure condition and
prove the packaged app still uses its bundled interpreter. It terminates the
app process group when finished.

## Start the Linux beta

Run the launcher that `npm run package:linux` copies into `apps/desktop/release/`.
That is the normal start. It does not need a host `libfuse2` package:

```sh
apps/desktop/release/run-linux-preview.sh
```

The launcher sets `APPIMAGE_EXTRACT_AND_RUN=1` before it executes the AppImage.
When `lib/libfuse.so.2` was bundled next to the launcher, it is added to
`LD_LIBRARY_PATH`. Installing `libfuse2` is not part of this start.

An optional FUSE mount of the raw AppImage still needs host `fusermount`.
Set `LASTBROWSER_APPIMAGE_MOUNT=1` only for that mount mode. If the bundled
library is absent, that optional mode also needs host `libfuse.so.2`.

A manual extract still works. Without `APPDIR`, electron-builder's `AppRun`
searches for `$1`, walks to `/`, and fails with
`/Lastbrowser: No such file or directory`.

```sh
./Lastbrowser-0.1.57-demo.4-x86_64.AppImage --appimage-extract
apps/desktop/scripts/run-extracted-appimage.sh squashfs-root
```

`run-extracted-appimage.sh` exports `APPDIR` to the extracted directory and
execs `AppRun`. Linux packages also rewrite that `AppRun` so a direct
`./AppRun` from the extracted directory sets `APPDIR` itself.

The committed Electron pin stays `45.0.0-alpha.14+wvcus` for Windows. Linux
AppImage builds pass Castlabs `37.10.3+wvcus` only as an electron-builder
override (`--config.electronVersion=37.10.3+wvcus`), not as a package.json or
`lastbrowser-builder-config.yml` pin change.

```sh
npm run smoke:linux:fresh-profile -- apps/desktop/release/Lastbrowser-0.1.56-x64.tar.gz
```

The test proves packaged Python and Sidekick startup in an isolated user
profile. It does not test live provider credentials or a release publication.
