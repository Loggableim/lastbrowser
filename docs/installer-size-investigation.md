# Windows package size investigation

Issue #322 compares the compressed 0.1.58 installer (reported as 640 MB)
with the 0.1.56 installer (reported as 277 MB). Public GitHub release metadata
retrieved on 2026-11-27 lists the 0.1.56 setup at 277,629,344 bytes and the
0.1.58 setup at 640,207,744 bytes: an increase of 362,578,400 bytes, or about
130.6%. The corresponding portable assets are 277,265,952 and 639,845,984
bytes. These are asset sizes from the [0.1.56](https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.56)
and [0.1.58](https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.58)
release metadata, not independently downloaded or inspected files. The cause
of the historical increase is not established by those figures.

## Existing work on 0.1.58

Draft [PR #354](https://github.com/Loggableim/lastbrowser/pull/354) reports an
independent inspection of the 0.1.58 **portable** asset. Its embedded 7z
archive reportedly has a header offset 4 GiB beyond the end of the extracted
file, and 7-Zip reports an unexpected end of archive. The PR identifies a
new broad local-AI resource filter as a plausible source of oversized contents,
but explicitly does not claim that model weights caused the increase. Those
observations have not been independently repeated in this investigation and
do not establish the content or integrity of the 0.1.58 setup installer.

The current `apps/desktop/package.json` already excludes `.gguf`,
`.safetensors` and model directories from the local-AI resource copy, and
excludes development runtime directories from `app.asar`. It also excludes
Sidekick tests and Python bytecode from the corresponding resource copies.
On 2026-11-26 the existing `runtime-package.test.ts` and
`root-package-private-payloads.test.ts` passed 23 tests against this manifest.
These tests check the configuration; they do not prove the contents or size
of a newly built installer.

## Available later test payload

On 2026-11-26 the locally available `0.1.62-rc2/payload-final/win-unpacked`
test payload was measured by recursively summing file lengths. These are
uncompressed MiB (1 MiB = 1,048,576 bytes), not installer download sizes:

| Component under `resources` | MiB |
| --- | ---: |
| Protected-space resources, including JDK | 391.7 |
| Local AI runtimes | 278.0 |
| Python runtime | 172.3 |
| `app.asar` | 134.5 |
| Sidekick service | 41.7 |
| `app.asar.unpacked` | 24.2 |

The JDK accounts for 373.8 MiB of protected-space resources, including 84.1 MiB
of `jmods`. The local AI runtimes comprise CPU and Vulkan builds for both
llama.cpp (52.1 and 95.3 MiB) and stable-diffusion.cpp (45.0 and 85.7 MiB).
They are executables and libraries; these figures are not evidence that model
weights are bundled. The packaged MSIX observed alongside this payload was
625.7 MiB compressed; this does not measure the original NSIS installer.

To reproduce the component measurement in PowerShell, set `$root` to the
payload's `resources` directory and run:

```powershell
Get-ChildItem -LiteralPath $root -Force | ForEach-Object {
  $bytes = if ($_.PSIsContainer) {
    (Get-ChildItem -LiteralPath $_.FullName -Recurse -File -Force |
      Measure-Object Length -Sum).Sum
  } else { $_.Length }
  [pscustomobject]@{ Name = $_.Name; MiB = [math]::Round($bytes / 1MB, 1) }
} | Sort-Object MiB -Descending
```

## Follow-up options

* Measure the actual 0.1.56 and 0.1.58 artifacts and their unpacked trees using
  the same method before attributing the increase to a particular dependency.
* Evaluate a minimal, reproducible Java runtime for protected spaces. Verify
  vault creation, mounting, recovery, upgrades, licenses and Store packaging
  before removing any JDK modules or tools.
* Evaluate optional, separately installed AI runtimes as described in #308,
  retaining integrity verification and an explicit offline/availability story.
  The current Store payload build verifies these runtimes both before and
  after packaging, so simply removing them would break that build contract.
* Audit Python and Sidekick test/cache files in a fresh release payload, then
  measure compressed artifacts after any exclusions. Preserve files needed at
  runtime and the applicable license notices.

No component was removed based on this measurement; the options require their
own functional tests and a comparison of compressed release artifacts.

## Cache files after running the test build

On 2026-11-26, after browser smoke tests had run, the r6 unpacked tree contained
364 `.pyc` files under `resources/services/sidekick` (11.24 MiB) and 3,323
under `resources/runtime/python` (19.94 MiB). Every observed bytecode file's
modification time was later than `resources/app.asar` in that build; the first
was about 85 seconds later. This is consistent with runtime-generated caches,
not proof that those files were shipped. A pristine payload or its packaged
archive must be inspected before attributing these bytes to the download.
The measurement is uncompressed and does not imply the same installer savings.
As a separate archive check, the existing `LastBrowser-0.1.62-x64-rc2.msix`
was opened read-only as a ZIP: its `app/resources/services/sidekick/` and
`app/resources/runtime/python/` entries contained zero `.pyc` files. This is
evidence about that rc2 MSIX only, not the later r6 payload or the old NSIS
installers.

On 2026-11-27 a post-smoke r7 unpacked payload contained approximately
5.4 MiB under Python's `site-packages/pip`, 3.5 MiB under `pythonwin`,
2.6 MiB under `setuptools`, and a 2.5 MiB `PyWin32.chm`. These are
uncompressed, rounded directory/file totals that may include generated caches;
they are not a clean-package or compressed-size measurement. A source search
found Sidekick commands and diagnostics that suggest installing optional
dependencies with pip. It did not establish which flows are reachable in the
packaged product, so removal of pip or related files requires an explicit
runtime/dependency and user-flow audit rather than a name-based exclusion.

## JDK module archive experiment

On 2026-11-26 the JDK from the separate r6 Windows test payload was copied to a
new test directory while excluding `jmods`. The copied `bin/java.exe -version`
reported Microsoft OpenJDK 25.0.5.0.2. Using that copy with the packaged
Cryptomator libraries and `InitializeSpaceVault.java`, an isolated test created
a new vault with a randomly generated ephemeral key, mounted it on a free
drive using the installed WinFsp service, wrote and read a test file, and
unmounted it. Initialization and the mount process both exited with code 0;
the test drive was no longer present after unmount. The two test vaults and
the JDK copy were removed afterwards.

This supports investigating omission of the 84.1 MiB uncompressed `jmods`
directory, but does not validate migration, recovery, TPM mode, upgrades,
another Windows installation, final package contents, or compressed download
size. No production packaging exclusion has been made on this evidence alone.

A subsequent isolated test created another vault with the reduced JDK, mounted
it, wrote a random marker, unmounted and reopened it, and read the same marker.
Scanning the vault files found no plaintext marker. The initial run reported
an unmount failure immediately after process exit; inspection found no remaining
test drive or Java process, but the run did not log which assertion failed. A
repeat that waited briefly for the drive to disappear passed the reopen,
plaintext-marker and unmount checks. This does not establish the cause of the
first failure. Both test vaults and the JDK copy were removed after checking
that the test drive was absent.

For a rough compression check, 7-Zip `a -tzip -mx=5` compressed the r6 JDK's
`jmods` directory by itself to 82,919,470 bytes (79.1 MiB); the temporary ZIP
was removed. This is not a measurement of a complete MSIX or NSIS installer,
whose compression settings and interactions may differ.
