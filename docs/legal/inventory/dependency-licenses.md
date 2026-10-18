# Lizenz-Inventar der Abhängigkeiten (A-022)

Stand: 2026-10-18T12:32:47.549Z

Erzeugt mit `node scripts/legal-inventory.mjs` im Repository-Root. Das Inventar ist eine technische Bestandsaufnahme, keine rechtliche Freigabe. Eine fehlende Lizenzangabe bedeutet **unbekannt**, nicht kompatibel.

## Erfassungsgrenzen und Quellen

- **npm:** jeder Nicht-Link-Eintrag unter `node_modules` in `package-lock.json`, inklusive verschachtelter Einträge. Maßgeblich sind die Felder `license` und `resolved` des Lockfiles. Die Zählung ist Lockfile-Einträge, nicht eindeutige Paketnamen.
- **Direkt:** ein Eintrag gilt als direkt, wenn sein Lockfile-Pfad exakt `node_modules/<name>` ist und der Name in `apps/desktop/package.json` unter `dependencies` oder `devDependencies` steht.
- **Python:** die gepinnten Pakete der Windows-Laufzeit in `apps/desktop/scripts/requirements-runtime.txt`. Die Lizenzangabe stammt aus den PyPI-Metadaten (`license` oder `license_expression`) für genau diese Version; reine Classifier werden als solche gekennzeichnet.
- **Python direkt:** Namen aus den Dependency-Strings und `build-system.requires` in `services/sidekick/pyproject.toml`. Namen ohne Pin erhalten keine Versions- oder Lizenzaussage.
- **Gebündelte Bestandteile, Web-Assets, Schriften, Icon-Sets und Modelle:** separat unten mit Pfad, Quelle und Beleg im Tree. Nicht im Installer gebündelte Komponenten sind als solche markiert.
- Vollständige Lockfile-Pfade und SHA-256-Werte stehen in `docs/legal/inventory/dependency-licenses.json`.

## Abdeckung

| Quelle | Einträge | Direkt | Ohne Lizenzangabe |
| :--- | :--- | :--- | :--- |
| npm-Lockfile | 486 | 19 | 0 |
| Python-Laufzeit | 66 | 18 | 0 |
| Gebündelte Laufzeiten | 3 | n/a | 0 |
| Schriften | 6 | n/a | 0 |
| Gebündelte Web-Assets | 7 | n/a | 0 |
| Icon-Sets | 5 | n/a | 0 |
| Lokaler Modellkatalog | 3 | n/a | 0 |

Verschachtelte npm-Einträge: 79. Eindeutige npm-Namen: 407. Übersprungene Workspace-Links: 1.

## Direkte npm-Abhängigkeiten

Die Version ist die im Lockfile aufgelöste Version, nicht die Bereichsangabe in `package.json`.

| Paket | Bereich | Version | Lizenz | Abschnitt | Quelle |
| :--- | :--- | :--- | :--- | :--- | :--- |
| @ghostery/adblocker-electron | ^2.18.2 | 2.18.2 | MPL-2.0 | runtime | [source](https://registry.npmjs.org/@ghostery/adblocker-electron/-/adblocker-electron-2.18.2.tgz) |
| @types/node | ^22.10.0 | 22.19.19 | MIT | development | [source](https://registry.npmjs.org/@types/node/-/node-22.19.19.tgz) |
| @types/react | ^19.0.0 | 19.2.15 | MIT | development | [source](https://registry.npmjs.org/@types/react/-/react-19.2.15.tgz) |
| @types/react-dom | ^19.0.0 | 19.2.3 | MIT | development | [source](https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.3.tgz) |
| @vitejs/plugin-react | ^5.0.0 | 5.2.0 | MIT | runtime | [source](https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-5.2.0.tgz) |
| electron | github:castlabs/electron-releases#v37.10.3+wvcus | 37.10.3+wvcus | MIT | development | `git+ssh://git@github.com/castlabs/electron-releases.git#e428e34f0a72dcff7aed9da06846b8872ed388db` |
| electron-builder | ^26.0.0 | 26.8.1 | MIT | development | [source](https://registry.npmjs.org/electron-builder/-/electron-builder-26.8.1.tgz) |
| electron-is-dev | ^3.0.1 | 3.0.1 | MIT | runtime | [source](https://registry.npmjs.org/electron-is-dev/-/electron-is-dev-3.0.1.tgz) |
| electron-updater | ^6.8.3 | 6.8.3 | MIT | runtime | [source](https://registry.npmjs.org/electron-updater/-/electron-updater-6.8.3.tgz) |
| esbuild | ^0.27.7 | 0.27.7 | MIT | development | [source](https://registry.npmjs.org/esbuild/-/esbuild-0.27.7.tgz) |
| lucide-react | ^0.468.0 | 0.468.0 | ISC | runtime | [source](https://registry.npmjs.org/lucide-react/-/lucide-react-0.468.0.tgz) |
| marked | ^15.0.12 | 15.0.12 | MIT | runtime | [source](https://registry.npmjs.org/marked/-/marked-15.0.12.tgz) |
| node-pty | ^1.1.0 | 1.1.0 | MIT | runtime | [source](https://registry.npmjs.org/node-pty/-/node-pty-1.1.0.tgz) |
| react | ^19.0.0 | 19.2.6 | MIT | runtime | [source](https://registry.npmjs.org/react/-/react-19.2.6.tgz) |
| react-dom | ^19.0.0 | 19.2.6 | MIT | runtime | [source](https://registry.npmjs.org/react-dom/-/react-dom-19.2.6.tgz) |
| typescript | ^5.7.0 | 5.9.3 | Apache-2.0 | development | [source](https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz) |
| vite | ^7.0.0 | 7.3.3 | MIT | runtime | [source](https://registry.npmjs.org/vite/-/vite-7.3.3.tgz) |
| vitest | ^3.0.0 | 3.2.4 | MIT | development | [source](https://registry.npmjs.org/vitest/-/vitest-3.2.4.tgz) |
| zustand | ^5.0.15 | 5.0.15 | MIT | runtime | [source](https://registry.npmjs.org/zustand/-/zustand-5.0.15.tgz) |

## npm-Lizenzverteilung

| Lizenzfeld im Lockfile | Einträge |
| :--- | :--- |
| MIT | 391 |
| ISC | 47 |
| MPL-2.0 | 12 |
| Apache-2.0 | 9 |
| BlueOak-1.0.0 | 8 |
| BSD-2-Clause | 7 |
| BSD-3-Clause | 6 |
| (MIT OR CC0-1.0) | 1 |
| (WTFPL OR MIT) | 1 |
| CC-BY-4.0 | 1 |
| Python-2.0 | 1 |
| WTFPL | 1 |
| WTFPL OR ISC | 1 |

## Alle npm-Lockfile-Einträge

Alphabetisch nach Lockfile-Pfad. `direkt` bezieht sich auf die oberste Ebene; `transitiv` umfasst auch verschachtelte Einträge. Die Spalte `dev` folgt dem Lockfile-Feld und ist nur ein Hinweis auf den Installationsgraphen, keine Aussage über die Verbreitung.

| Paket | Version | Lizenz | Art | dev | Quelle |
| :--- | :--- | :--- | :--- | :--- | :--- |
| @babel/code-frame | 7.29.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/code-frame/-/code-frame-7.29.0.tgz) |
| @babel/compat-data | 7.29.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/compat-data/-/compat-data-7.29.3.tgz) |
| @babel/core | 7.29.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/core/-/core-7.29.0.tgz) |
| @babel/generator | 7.29.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/generator/-/generator-7.29.1.tgz) |
| @babel/helper-compilation-targets | 7.28.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-compilation-targets/-/helper-compilation-targets-7.28.6.tgz) |
| @babel/helper-globals | 7.28.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-globals/-/helper-globals-7.28.0.tgz) |
| @babel/helper-module-imports | 7.28.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-module-imports/-/helper-module-imports-7.28.6.tgz) |
| @babel/helper-module-transforms | 7.28.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-module-transforms/-/helper-module-transforms-7.28.6.tgz) |
| @babel/helper-plugin-utils | 7.28.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-plugin-utils/-/helper-plugin-utils-7.28.6.tgz) |
| @babel/helper-string-parser | 7.27.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-string-parser/-/helper-string-parser-7.27.1.tgz) |
| @babel/helper-validator-identifier | 7.28.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-validator-identifier/-/helper-validator-identifier-7.28.5.tgz) |
| @babel/helper-validator-option | 7.27.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helper-validator-option/-/helper-validator-option-7.27.1.tgz) |
| @babel/helpers | 7.29.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/helpers/-/helpers-7.29.2.tgz) |
| @babel/parser | 7.29.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/parser/-/parser-7.29.3.tgz) |
| @babel/plugin-transform-react-jsx-self | 7.27.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/plugin-transform-react-jsx-self/-/plugin-transform-react-jsx-self-7.27.1.tgz) |
| @babel/plugin-transform-react-jsx-source | 7.27.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/plugin-transform-react-jsx-source/-/plugin-transform-react-jsx-source-7.27.1.tgz) |
| @babel/template | 7.28.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/template/-/template-7.28.6.tgz) |
| @babel/traverse | 7.29.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/traverse/-/traverse-7.29.0.tgz) |
| @babel/types | 7.29.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@babel/types/-/types-7.29.0.tgz) |
| @develar/schema-utils | 2.6.5 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@develar/schema-utils/-/schema-utils-2.6.5.tgz) |
| @electron/asar | 3.4.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@electron/asar/-/asar-3.4.1.tgz) |
| balanced-match | 1.0.2 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | 1.1.14 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.14.tgz) |
| minimatch | 3.1.5 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| @electron/fuses | 1.8.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@electron/fuses/-/fuses-1.8.0.tgz) |
| fs-extra | 9.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-9.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @electron/get | 2.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@electron/get/-/get-2.0.3.tgz) |
| @electron/notarize | 2.5.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@electron/notarize/-/notarize-2.5.0.tgz) |
| fs-extra | 9.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-9.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @electron/osx-sign | 1.3.3 | BSD-2-Clause | transitiv | ja | [source](https://registry.npmjs.org/@electron/osx-sign/-/osx-sign-1.3.3.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| isbinaryfile | 4.0.10 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/isbinaryfile/-/isbinaryfile-4.0.10.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @electron/rebuild | 4.0.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@electron/rebuild/-/rebuild-4.0.4.tgz) |
| @electron/universal | 2.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@electron/universal/-/universal-2.0.3.tgz) |
| balanced-match | 1.0.2 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | 2.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.0.tgz) |
| fs-extra | 11.3.5 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-11.3.5.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| minimatch | 9.0.9 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-9.0.9.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @electron/windows-sign | 1.2.2 | BSD-2-Clause | transitiv | ja | [source](https://registry.npmjs.org/@electron/windows-sign/-/windows-sign-1.2.2.tgz) |
| fs-extra | 11.3.5 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-11.3.5.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @esbuild/aix-ppc64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/aix-ppc64/-/aix-ppc64-0.27.7.tgz) |
| @esbuild/android-arm | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/android-arm/-/android-arm-0.27.7.tgz) |
| @esbuild/android-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/android-arm64/-/android-arm64-0.27.7.tgz) |
| @esbuild/android-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/android-x64/-/android-x64-0.27.7.tgz) |
| @esbuild/darwin-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/darwin-arm64/-/darwin-arm64-0.27.7.tgz) |
| @esbuild/darwin-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/darwin-x64/-/darwin-x64-0.27.7.tgz) |
| @esbuild/freebsd-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/freebsd-arm64/-/freebsd-arm64-0.27.7.tgz) |
| @esbuild/freebsd-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/freebsd-x64/-/freebsd-x64-0.27.7.tgz) |
| @esbuild/linux-arm | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-arm/-/linux-arm-0.27.7.tgz) |
| @esbuild/linux-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-arm64/-/linux-arm64-0.27.7.tgz) |
| @esbuild/linux-ia32 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-ia32/-/linux-ia32-0.27.7.tgz) |
| @esbuild/linux-loong64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-loong64/-/linux-loong64-0.27.7.tgz) |
| @esbuild/linux-mips64el | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-mips64el/-/linux-mips64el-0.27.7.tgz) |
| @esbuild/linux-ppc64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-ppc64/-/linux-ppc64-0.27.7.tgz) |
| @esbuild/linux-riscv64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-riscv64/-/linux-riscv64-0.27.7.tgz) |
| @esbuild/linux-s390x | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-s390x/-/linux-s390x-0.27.7.tgz) |
| @esbuild/linux-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.27.7.tgz) |
| @esbuild/netbsd-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/netbsd-arm64/-/netbsd-arm64-0.27.7.tgz) |
| @esbuild/netbsd-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/netbsd-x64/-/netbsd-x64-0.27.7.tgz) |
| @esbuild/openbsd-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/openbsd-arm64/-/openbsd-arm64-0.27.7.tgz) |
| @esbuild/openbsd-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/openbsd-x64/-/openbsd-x64-0.27.7.tgz) |
| @esbuild/openharmony-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/openharmony-arm64/-/openharmony-arm64-0.27.7.tgz) |
| @esbuild/sunos-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/sunos-x64/-/sunos-x64-0.27.7.tgz) |
| @esbuild/win32-arm64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.27.7.tgz) |
| @esbuild/win32-ia32 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/win32-ia32/-/win32-ia32-0.27.7.tgz) |
| @esbuild/win32-x64 | 0.27.7 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.27.7.tgz) |
| @ghostery/adblocker | 2.18.2 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@ghostery/adblocker/-/adblocker-2.18.2.tgz) |
| @ghostery/adblocker-content | 2.18.2 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@ghostery/adblocker-content/-/adblocker-content-2.18.2.tgz) |
| @ghostery/adblocker-electron | 2.18.2 | MPL-2.0 | direkt (runtime) | nein | [source](https://registry.npmjs.org/@ghostery/adblocker-electron/-/adblocker-electron-2.18.2.tgz) |
| @ghostery/adblocker-electron-preload | 2.18.2 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@ghostery/adblocker-electron-preload/-/adblocker-electron-preload-2.18.2.tgz) |
| @ghostery/adblocker-extended-selectors | 2.18.2 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@ghostery/adblocker-extended-selectors/-/adblocker-extended-selectors-2.18.2.tgz) |
| @ghostery/url-parser | 1.3.1 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@ghostery/url-parser/-/url-parser-1.3.1.tgz) |
| @isaacs/fs-minipass | 4.0.1 | ISC | transitiv | ja | [source](https://registry.npmjs.org/@isaacs/fs-minipass/-/fs-minipass-4.0.1.tgz) |
| @jridgewell/gen-mapping | 0.3.13 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@jridgewell/gen-mapping/-/gen-mapping-0.3.13.tgz) |
| @jridgewell/remapping | 2.3.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@jridgewell/remapping/-/remapping-2.3.5.tgz) |
| @jridgewell/resolve-uri | 3.1.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@jridgewell/resolve-uri/-/resolve-uri-3.1.2.tgz) |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@jridgewell/sourcemap-codec/-/sourcemap-codec-1.5.5.tgz) |
| @jridgewell/trace-mapping | 0.3.31 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@jridgewell/trace-mapping/-/trace-mapping-0.3.31.tgz) |
| @malept/cross-spawn-promise | 2.0.0 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/@malept/cross-spawn-promise/-/cross-spawn-promise-2.0.0.tgz) |
| @malept/flatpak-bundler | 0.4.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@malept/flatpak-bundler/-/flatpak-bundler-0.4.0.tgz) |
| fs-extra | 9.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-9.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| @remusao/guess-url-type | 2.1.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/guess-url-type/-/guess-url-type-2.1.0.tgz) |
| @remusao/small | 2.1.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/small/-/small-2.1.0.tgz) |
| @remusao/smaz | 2.2.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/smaz/-/smaz-2.2.0.tgz) |
| @remusao/smaz-compress | 2.2.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/smaz-compress/-/smaz-compress-2.2.0.tgz) |
| @remusao/smaz-decompress | 2.2.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/smaz-decompress/-/smaz-decompress-2.2.0.tgz) |
| @remusao/trie | 2.1.0 | MPL-2.0 | transitiv | nein | [source](https://registry.npmjs.org/@remusao/trie/-/trie-2.1.0.tgz) |
| @rolldown/pluginutils | 1.0.0-rc.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-rc.3.tgz) |
| @rollup/rollup-android-arm-eabi | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-android-arm-eabi/-/rollup-android-arm-eabi-4.60.4.tgz) |
| @rollup/rollup-android-arm64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-android-arm64/-/rollup-android-arm64-4.60.4.tgz) |
| @rollup/rollup-darwin-arm64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-darwin-arm64/-/rollup-darwin-arm64-4.60.4.tgz) |
| @rollup/rollup-darwin-x64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-darwin-x64/-/rollup-darwin-x64-4.60.4.tgz) |
| @rollup/rollup-freebsd-arm64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-freebsd-arm64/-/rollup-freebsd-arm64-4.60.4.tgz) |
| @rollup/rollup-freebsd-x64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-freebsd-x64/-/rollup-freebsd-x64-4.60.4.tgz) |
| @rollup/rollup-linux-arm-gnueabihf | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-arm-gnueabihf/-/rollup-linux-arm-gnueabihf-4.60.4.tgz) |
| @rollup/rollup-linux-arm-musleabihf | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-arm-musleabihf/-/rollup-linux-arm-musleabihf-4.60.4.tgz) |
| @rollup/rollup-linux-arm64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-arm64-gnu/-/rollup-linux-arm64-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-arm64-musl | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-arm64-musl/-/rollup-linux-arm64-musl-4.60.4.tgz) |
| @rollup/rollup-linux-loong64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-loong64-gnu/-/rollup-linux-loong64-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-loong64-musl | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-loong64-musl/-/rollup-linux-loong64-musl-4.60.4.tgz) |
| @rollup/rollup-linux-ppc64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-ppc64-gnu/-/rollup-linux-ppc64-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-ppc64-musl | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-ppc64-musl/-/rollup-linux-ppc64-musl-4.60.4.tgz) |
| @rollup/rollup-linux-riscv64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-riscv64-gnu/-/rollup-linux-riscv64-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-riscv64-musl | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-riscv64-musl/-/rollup-linux-riscv64-musl-4.60.4.tgz) |
| @rollup/rollup-linux-s390x-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-s390x-gnu/-/rollup-linux-s390x-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-x64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-x64-gnu/-/rollup-linux-x64-gnu-4.60.4.tgz) |
| @rollup/rollup-linux-x64-musl | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-linux-x64-musl/-/rollup-linux-x64-musl-4.60.4.tgz) |
| @rollup/rollup-openbsd-x64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-openbsd-x64/-/rollup-openbsd-x64-4.60.4.tgz) |
| @rollup/rollup-openharmony-arm64 | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-openharmony-arm64/-/rollup-openharmony-arm64-4.60.4.tgz) |
| @rollup/rollup-win32-arm64-msvc | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-win32-arm64-msvc/-/rollup-win32-arm64-msvc-4.60.4.tgz) |
| @rollup/rollup-win32-ia32-msvc | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-win32-ia32-msvc/-/rollup-win32-ia32-msvc-4.60.4.tgz) |
| @rollup/rollup-win32-x64-gnu | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-win32-x64-gnu/-/rollup-win32-x64-gnu-4.60.4.tgz) |
| @rollup/rollup-win32-x64-msvc | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@rollup/rollup-win32-x64-msvc/-/rollup-win32-x64-msvc-4.60.4.tgz) |
| @sindresorhus/is | 4.6.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@sindresorhus/is/-/is-4.6.0.tgz) |
| @szmarczak/http-timer | 4.0.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@szmarczak/http-timer/-/http-timer-4.0.6.tgz) |
| @types/babel__core | 7.20.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/babel__core/-/babel__core-7.20.5.tgz) |
| @types/babel__generator | 7.27.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/babel__generator/-/babel__generator-7.27.0.tgz) |
| @types/babel__template | 7.4.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/babel__template/-/babel__template-7.4.4.tgz) |
| @types/babel__traverse | 7.28.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/babel__traverse/-/babel__traverse-7.28.0.tgz) |
| @types/cacheable-request | 6.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/cacheable-request/-/cacheable-request-6.0.3.tgz) |
| @types/chai | 5.2.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/chai/-/chai-5.2.3.tgz) |
| @types/debug | 4.1.13 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/debug/-/debug-4.1.13.tgz) |
| @types/deep-eql | 4.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/deep-eql/-/deep-eql-4.0.2.tgz) |
| @types/estree | 1.0.8 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/estree/-/estree-1.0.8.tgz) |
| @types/fs-extra | 9.0.13 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/fs-extra/-/fs-extra-9.0.13.tgz) |
| @types/http-cache-semantics | 4.2.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/http-cache-semantics/-/http-cache-semantics-4.2.0.tgz) |
| @types/keyv | 3.1.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/keyv/-/keyv-3.1.4.tgz) |
| @types/ms | 2.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/ms/-/ms-2.1.0.tgz) |
| @types/node | 22.19.19 | MIT | direkt (development) | nein | [source](https://registry.npmjs.org/@types/node/-/node-22.19.19.tgz) |
| @types/plist | 3.0.5 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/plist/-/plist-3.0.5.tgz) |
| @types/react | 19.2.15 | MIT | direkt (development) | ja | [source](https://registry.npmjs.org/@types/react/-/react-19.2.15.tgz) |
| @types/react-dom | 19.2.3 | MIT | direkt (development) | ja | [source](https://registry.npmjs.org/@types/react-dom/-/react-dom-19.2.3.tgz) |
| @types/responselike | 1.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/responselike/-/responselike-1.0.3.tgz) |
| @types/verror | 1.10.11 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@types/verror/-/verror-1.10.11.tgz) |
| @types/yauzl | 2.10.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/@types/yauzl/-/yauzl-2.10.3.tgz) |
| @vitejs/plugin-react | 5.2.0 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/@vitejs/plugin-react/-/plugin-react-5.2.0.tgz) |
| @vitest/expect | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/expect/-/expect-3.2.4.tgz) |
| @vitest/mocker | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/mocker/-/mocker-3.2.4.tgz) |
| @vitest/pretty-format | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/pretty-format/-/pretty-format-3.2.4.tgz) |
| @vitest/runner | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/runner/-/runner-3.2.4.tgz) |
| @vitest/snapshot | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/snapshot/-/snapshot-3.2.4.tgz) |
| @vitest/spy | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/spy/-/spy-3.2.4.tgz) |
| @vitest/utils | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@vitest/utils/-/utils-3.2.4.tgz) |
| @xmldom/xmldom | 0.8.13 | MIT | transitiv | ja | [source](https://registry.npmjs.org/@xmldom/xmldom/-/xmldom-0.8.13.tgz) |
| 7zip-bin | 5.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/7zip-bin/-/7zip-bin-5.2.0.tgz) |
| abbrev | 4.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/abbrev/-/abbrev-4.0.0.tgz) |
| agent-base | 7.1.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/agent-base/-/agent-base-7.1.4.tgz) |
| ajv | 6.15.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/ajv/-/ajv-6.15.0.tgz) |
| ajv-keywords | 3.5.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/ajv-keywords/-/ajv-keywords-3.5.2.tgz) |
| ansi-regex | 5.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/ansi-regex/-/ansi-regex-5.0.1.tgz) |
| ansi-styles | 4.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/ansi-styles/-/ansi-styles-4.3.0.tgz) |
| app-builder-bin | 5.0.0-alpha.12 | MIT | transitiv | ja | [source](https://registry.npmjs.org/app-builder-bin/-/app-builder-bin-5.0.0-alpha.12.tgz) |
| app-builder-lib | 26.8.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/app-builder-lib/-/app-builder-lib-26.8.1.tgz) |
| @electron/get | 3.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/@electron/get/-/get-3.1.0.tgz) |
| fs-extra | 8.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-8.1.0.tgz) |
| semver | 6.3.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-6.3.1.tgz) |
| ci-info | 4.3.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/ci-info/-/ci-info-4.3.1.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| semver | 7.7.4 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-7.7.4.tgz) |
| argparse | 2.0.1 | Python-2.0 | transitiv | nein | [source](https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz) |
| assert-plus | 1.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/assert-plus/-/assert-plus-1.0.0.tgz) |
| assertion-error | 2.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/assertion-error/-/assertion-error-2.0.1.tgz) |
| astral-regex | 2.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/astral-regex/-/astral-regex-2.0.0.tgz) |
| async | 3.2.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/async/-/async-3.2.6.tgz) |
| async-exit-hook | 2.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/async-exit-hook/-/async-exit-hook-2.0.1.tgz) |
| asynckit | 0.4.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/asynckit/-/asynckit-0.4.0.tgz) |
| at-least-node | 1.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/at-least-node/-/at-least-node-1.0.0.tgz) |
| balanced-match | 4.0.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-4.0.4.tgz) |
| base64-js | 1.5.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz) |
| baseline-browser-mapping | 2.10.32 | Apache-2.0 | transitiv | nein | [source](https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.10.32.tgz) |
| boolean | 3.2.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/boolean/-/boolean-3.2.0.tgz) |
| brace-expansion | 5.0.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.6.tgz) |
| browserslist | 4.28.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/browserslist/-/browserslist-4.28.2.tgz) |
| buffer | 5.7.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/buffer/-/buffer-5.7.1.tgz) |
| buffer-crc32 | 0.2.13 | MIT | transitiv | nein | [source](https://registry.npmjs.org/buffer-crc32/-/buffer-crc32-0.2.13.tgz) |
| buffer-from | 1.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/buffer-from/-/buffer-from-1.1.2.tgz) |
| builder-util | 26.8.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/builder-util/-/builder-util-26.8.1.tgz) |
| builder-util-runtime | 9.5.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/builder-util-runtime/-/builder-util-runtime-9.5.1.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| cac | 6.7.14 | MIT | transitiv | ja | [source](https://registry.npmjs.org/cac/-/cac-6.7.14.tgz) |
| cacheable-lookup | 5.0.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/cacheable-lookup/-/cacheable-lookup-5.0.4.tgz) |
| cacheable-request | 7.0.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/cacheable-request/-/cacheable-request-7.0.4.tgz) |
| call-bind-apply-helpers | 1.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz) |
| caniuse-lite | 1.0.30001793 | CC-BY-4.0 | transitiv | nein | [source](https://registry.npmjs.org/caniuse-lite/-/caniuse-lite-1.0.30001793.tgz) |
| chai | 5.3.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/chai/-/chai-5.3.3.tgz) |
| chalk | 4.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/chalk/-/chalk-4.1.2.tgz) |
| check-error | 2.1.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/check-error/-/check-error-2.1.3.tgz) |
| chownr | 3.0.0 | BlueOak-1.0.0 | transitiv | ja | [source](https://registry.npmjs.org/chownr/-/chownr-3.0.0.tgz) |
| chromium-pickle-js | 0.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/chromium-pickle-js/-/chromium-pickle-js-0.2.0.tgz) |
| ci-info | 4.4.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/ci-info/-/ci-info-4.4.0.tgz) |
| cli-truncate | 2.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/cli-truncate/-/cli-truncate-2.1.0.tgz) |
| cliui | 8.0.1 | ISC | transitiv | ja | [source](https://registry.npmjs.org/cliui/-/cliui-8.0.1.tgz) |
| clone-response | 1.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/clone-response/-/clone-response-1.0.3.tgz) |
| color-convert | 2.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/color-convert/-/color-convert-2.0.1.tgz) |
| color-name | 1.1.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/color-name/-/color-name-1.1.4.tgz) |
| combined-stream | 1.0.8 | MIT | transitiv | ja | [source](https://registry.npmjs.org/combined-stream/-/combined-stream-1.0.8.tgz) |
| commander | 5.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/commander/-/commander-5.1.0.tgz) |
| compare-version | 0.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/compare-version/-/compare-version-0.1.2.tgz) |
| concat-map | 0.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz) |
| convert-source-map | 2.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz) |
| core-util-is | 1.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/core-util-is/-/core-util-is-1.0.2.tgz) |
| crc | 3.8.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/crc/-/crc-3.8.0.tgz) |
| cross-dirname | 0.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/cross-dirname/-/cross-dirname-0.1.0.tgz) |
| cross-spawn | 7.0.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz) |
| isexe | 2.0.0 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/isexe/-/isexe-2.0.0.tgz) |
| which | 2.0.2 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/which/-/which-2.0.2.tgz) |
| csstype | 3.2.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/csstype/-/csstype-3.2.3.tgz) |
| debug | 4.4.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/debug/-/debug-4.4.3.tgz) |
| decompress-response | 6.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/decompress-response/-/decompress-response-6.0.0.tgz) |
| mimic-response | 3.1.0 | MIT | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/mimic-response/-/mimic-response-3.1.0.tgz) |
| deep-eql | 5.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/deep-eql/-/deep-eql-5.0.2.tgz) |
| defer-to-connect | 2.0.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/defer-to-connect/-/defer-to-connect-2.0.1.tgz) |
| define-data-property | 1.1.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/define-data-property/-/define-data-property-1.1.4.tgz) |
| define-properties | 1.2.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/define-properties/-/define-properties-1.2.1.tgz) |
| delayed-stream | 1.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/delayed-stream/-/delayed-stream-1.0.0.tgz) |
| detect-node | 2.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/detect-node/-/detect-node-2.1.0.tgz) |
| dir-compare | 4.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/dir-compare/-/dir-compare-4.2.0.tgz) |
| balanced-match | 1.0.2 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | 1.1.14 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.14.tgz) |
| minimatch | 3.1.5 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| dmg-builder | 26.8.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/dmg-builder/-/dmg-builder-26.8.1.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| dmg-license | 1.0.11 | MIT | transitiv | ja | [source](https://registry.npmjs.org/dmg-license/-/dmg-license-1.0.11.tgz) |
| dotenv | 16.6.1 | BSD-2-Clause | transitiv | ja | [source](https://registry.npmjs.org/dotenv/-/dotenv-16.6.1.tgz) |
| dotenv-expand | 11.0.7 | BSD-2-Clause | transitiv | ja | [source](https://registry.npmjs.org/dotenv-expand/-/dotenv-expand-11.0.7.tgz) |
| dunder-proto | 1.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz) |
| ejs | 3.1.10 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/ejs/-/ejs-3.1.10.tgz) |
| electron | 37.10.3+wvcus | MIT | direkt (development) | nein | `git+ssh://git@github.com/castlabs/electron-releases.git#e428e34f0a72dcff7aed9da06846b8872ed388db` |
| electron-builder | 26.8.1 | MIT | direkt (development) | ja | [source](https://registry.npmjs.org/electron-builder/-/electron-builder-26.8.1.tgz) |
| electron-builder-squirrel-windows | 26.8.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/electron-builder-squirrel-windows/-/electron-builder-squirrel-windows-26.8.1.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| electron-is-dev | 3.0.1 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/electron-is-dev/-/electron-is-dev-3.0.1.tgz) |
| electron-publish | 26.8.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/electron-publish/-/electron-publish-26.8.1.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| electron-to-chromium | 1.5.361 | ISC | transitiv | nein | [source](https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.361.tgz) |
| electron-updater | 6.8.3 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/electron-updater/-/electron-updater-6.8.3.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| semver | 7.7.4 | ISC | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/semver/-/semver-7.7.4.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| electron-winstaller | 5.4.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/electron-winstaller/-/electron-winstaller-5.4.0.tgz) |
| fs-extra | 7.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-7.0.1.tgz) |
| emoji-regex | 8.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/emoji-regex/-/emoji-regex-8.0.0.tgz) |
| end-of-stream | 1.4.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/end-of-stream/-/end-of-stream-1.4.5.tgz) |
| env-paths | 2.2.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/env-paths/-/env-paths-2.2.1.tgz) |
| err-code | 2.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/err-code/-/err-code-2.0.3.tgz) |
| es-define-property | 1.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz) |
| es-errors | 1.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz) |
| es-module-lexer | 1.7.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/es-module-lexer/-/es-module-lexer-1.7.0.tgz) |
| es-object-atoms | 1.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz) |
| es-set-tostringtag | 2.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/es-set-tostringtag/-/es-set-tostringtag-2.1.0.tgz) |
| es6-error | 4.1.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/es6-error/-/es6-error-4.1.1.tgz) |
| esbuild | 0.27.7 | MIT | direkt (development) | nein | [source](https://registry.npmjs.org/esbuild/-/esbuild-0.27.7.tgz) |
| escalade | 3.2.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz) |
| escape-string-regexp | 4.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz) |
| estree-walker | 3.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/estree-walker/-/estree-walker-3.0.3.tgz) |
| expect-type | 1.3.0 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/expect-type/-/expect-type-1.3.0.tgz) |
| exponential-backoff | 3.1.3 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/exponential-backoff/-/exponential-backoff-3.1.3.tgz) |
| extract-zip | 2.0.1 | BSD-2-Clause | transitiv | nein | [source](https://registry.npmjs.org/extract-zip/-/extract-zip-2.0.1.tgz) |
| extsprintf | 1.4.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/extsprintf/-/extsprintf-1.4.1.tgz) |
| fast-deep-equal | 3.1.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz) |
| fast-json-stable-stringify | 2.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz) |
| fd-slicer | 1.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/fd-slicer/-/fd-slicer-1.1.0.tgz) |
| fdir | 6.5.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/fdir/-/fdir-6.5.0.tgz) |
| filelist | 1.0.6 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/filelist/-/filelist-1.0.6.tgz) |
| balanced-match | 1.0.2 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | 2.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-2.1.0.tgz) |
| minimatch | 5.1.9 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-5.1.9.tgz) |
| form-data | 4.0.5 | MIT | transitiv | ja | [source](https://registry.npmjs.org/form-data/-/form-data-4.0.5.tgz) |
| fs-extra | 8.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-8.1.0.tgz) |
| fs.realpath | 1.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/fs.realpath/-/fs.realpath-1.0.0.tgz) |
| fsevents | 2.3.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz) |
| function-bind | 1.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz) |
| gensync | 1.0.0-beta.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz) |
| get-caller-file | 2.0.5 | ISC | transitiv | ja | [source](https://registry.npmjs.org/get-caller-file/-/get-caller-file-2.0.5.tgz) |
| get-intrinsic | 1.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz) |
| get-proto | 1.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz) |
| get-stream | 5.2.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/get-stream/-/get-stream-5.2.0.tgz) |
| glob | 7.2.3 | ISC | transitiv | ja | [source](https://registry.npmjs.org/glob/-/glob-7.2.3.tgz) |
| balanced-match | 1.0.2 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz) |
| brace-expansion | 1.1.14 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.14.tgz) |
| minimatch | 3.1.5 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz) |
| global-agent | 3.0.0 | BSD-3-Clause | transitiv | nein | [source](https://registry.npmjs.org/global-agent/-/global-agent-3.0.0.tgz) |
| semver | 7.8.1 | ISC | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/semver/-/semver-7.8.1.tgz) |
| globalthis | 1.0.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/globalthis/-/globalthis-1.0.4.tgz) |
| gopd | 1.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz) |
| got | 11.8.6 | MIT | transitiv | nein | [source](https://registry.npmjs.org/got/-/got-11.8.6.tgz) |
| graceful-fs | 4.2.11 | ISC | transitiv | nein | [source](https://registry.npmjs.org/graceful-fs/-/graceful-fs-4.2.11.tgz) |
| has-flag | 4.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz) |
| has-property-descriptors | 1.0.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/has-property-descriptors/-/has-property-descriptors-1.0.2.tgz) |
| has-symbols | 1.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz) |
| has-tostringtag | 1.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/has-tostringtag/-/has-tostringtag-1.0.2.tgz) |
| hasown | 2.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/hasown/-/hasown-2.0.3.tgz) |
| hosted-git-info | 4.1.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/hosted-git-info/-/hosted-git-info-4.1.0.tgz) |
| lru-cache | 6.0.0 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/lru-cache/-/lru-cache-6.0.0.tgz) |
| yallist | 4.0.0 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/yallist/-/yallist-4.0.0.tgz) |
| http-cache-semantics | 4.2.0 | BSD-2-Clause | transitiv | nein | [source](https://registry.npmjs.org/http-cache-semantics/-/http-cache-semantics-4.2.0.tgz) |
| http-proxy-agent | 7.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/http-proxy-agent/-/http-proxy-agent-7.0.2.tgz) |
| http2-wrapper | 1.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/http2-wrapper/-/http2-wrapper-1.0.3.tgz) |
| https-proxy-agent | 7.0.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/https-proxy-agent/-/https-proxy-agent-7.0.6.tgz) |
| iconv-corefoundation | 1.1.7 | MIT | transitiv | ja | [source](https://registry.npmjs.org/iconv-corefoundation/-/iconv-corefoundation-1.1.7.tgz) |
| iconv-lite | 0.6.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.6.3.tgz) |
| ieee754 | 1.2.1 | BSD-3-Clause | transitiv | ja | [source](https://registry.npmjs.org/ieee754/-/ieee754-1.2.1.tgz) |
| inflight | 1.0.6 | ISC | transitiv | ja | [source](https://registry.npmjs.org/inflight/-/inflight-1.0.6.tgz) |
| inherits | 2.0.4 | ISC | transitiv | ja | [source](https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz) |
| is-fullwidth-code-point | 3.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/is-fullwidth-code-point/-/is-fullwidth-code-point-3.0.0.tgz) |
| isbinaryfile | 5.0.7 | MIT | transitiv | ja | [source](https://registry.npmjs.org/isbinaryfile/-/isbinaryfile-5.0.7.tgz) |
| isexe | 3.1.5 | BlueOak-1.0.0 | transitiv | ja | [source](https://registry.npmjs.org/isexe/-/isexe-3.1.5.tgz) |
| jake | 10.9.4 | Apache-2.0 | transitiv | ja | [source](https://registry.npmjs.org/jake/-/jake-10.9.4.tgz) |
| jiti | 2.7.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/jiti/-/jiti-2.7.0.tgz) |
| js-tokens | 4.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/js-tokens/-/js-tokens-4.0.0.tgz) |
| js-yaml | 4.1.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/js-yaml/-/js-yaml-4.1.1.tgz) |
| jsesc | 3.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/jsesc/-/jsesc-3.1.0.tgz) |
| json-buffer | 3.0.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/json-buffer/-/json-buffer-3.0.1.tgz) |
| json-schema-traverse | 0.4.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/json-schema-traverse/-/json-schema-traverse-0.4.1.tgz) |
| json-stringify-safe | 5.0.1 | ISC | transitiv | nein | [source](https://registry.npmjs.org/json-stringify-safe/-/json-stringify-safe-5.0.1.tgz) |
| json5 | 2.2.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/json5/-/json5-2.2.3.tgz) |
| jsonfile | 4.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-4.0.0.tgz) |
| keyv | 4.5.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/keyv/-/keyv-4.5.4.tgz) |
| lazy-val | 1.0.5 | MIT | transitiv | nein | [source](https://registry.npmjs.org/lazy-val/-/lazy-val-1.0.5.tgz) |
| lodash | 4.18.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/lodash/-/lodash-4.18.1.tgz) |
| lodash.escaperegexp | 4.1.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/lodash.escaperegexp/-/lodash.escaperegexp-4.1.2.tgz) |
| lodash.isequal | 4.5.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/lodash.isequal/-/lodash.isequal-4.5.0.tgz) |
| loupe | 3.2.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/loupe/-/loupe-3.2.1.tgz) |
| lowercase-keys | 2.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/lowercase-keys/-/lowercase-keys-2.0.0.tgz) |
| lru-cache | 5.1.1 | ISC | transitiv | nein | [source](https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz) |
| lucide-react | 0.468.0 | ISC | direkt (runtime) | nein | [source](https://registry.npmjs.org/lucide-react/-/lucide-react-0.468.0.tgz) |
| magic-string | 0.30.21 | MIT | transitiv | ja | [source](https://registry.npmjs.org/magic-string/-/magic-string-0.30.21.tgz) |
| marked | 15.0.12 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/marked/-/marked-15.0.12.tgz) |
| matcher | 3.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/matcher/-/matcher-3.0.0.tgz) |
| math-intrinsics | 1.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz) |
| mime | 2.6.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/mime/-/mime-2.6.0.tgz) |
| mime-db | 1.52.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz) |
| mime-types | 2.1.35 | MIT | transitiv | ja | [source](https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz) |
| mimic-response | 1.0.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/mimic-response/-/mimic-response-1.0.1.tgz) |
| minimatch | 10.2.5 | BlueOak-1.0.0 | transitiv | ja | [source](https://registry.npmjs.org/minimatch/-/minimatch-10.2.5.tgz) |
| minimist | 1.2.8 | MIT | transitiv | ja | [source](https://registry.npmjs.org/minimist/-/minimist-1.2.8.tgz) |
| minipass | 7.1.3 | BlueOak-1.0.0 | transitiv | ja | [source](https://registry.npmjs.org/minipass/-/minipass-7.1.3.tgz) |
| minizlib | 3.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/minizlib/-/minizlib-3.1.0.tgz) |
| mkdirp | 0.5.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/mkdirp/-/mkdirp-0.5.6.tgz) |
| ms | 2.1.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/ms/-/ms-2.1.3.tgz) |
| nanoid | 3.3.12 | MIT | transitiv | nein | [source](https://registry.npmjs.org/nanoid/-/nanoid-3.3.12.tgz) |
| node-abi | 4.31.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/node-abi/-/node-abi-4.31.0.tgz) |
| semver | 7.8.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-7.8.1.tgz) |
| node-addon-api | 1.7.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/node-addon-api/-/node-addon-api-1.7.2.tgz) |
| node-api-version | 0.2.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/node-api-version/-/node-api-version-0.2.1.tgz) |
| semver | 7.8.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-7.8.1.tgz) |
| node-gyp | 12.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/node-gyp/-/node-gyp-12.3.0.tgz) |
| isexe | 4.0.0 | BlueOak-1.0.0 | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/isexe/-/isexe-4.0.0.tgz) |
| semver | 7.8.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-7.8.1.tgz) |
| which | 6.0.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/which/-/which-6.0.1.tgz) |
| node-pty | 1.1.0 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/node-pty/-/node-pty-1.1.0.tgz) |
| node-addon-api | 7.1.1 | MIT | transitiv (verschachtelt) | nein | [source](https://registry.npmjs.org/node-addon-api/-/node-addon-api-7.1.1.tgz) |
| node-releases | 2.0.46 | MIT | transitiv | nein | [source](https://registry.npmjs.org/node-releases/-/node-releases-2.0.46.tgz) |
| nopt | 9.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/nopt/-/nopt-9.0.0.tgz) |
| normalize-url | 6.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/normalize-url/-/normalize-url-6.1.0.tgz) |
| object-keys | 1.1.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/object-keys/-/object-keys-1.1.1.tgz) |
| once | 1.4.0 | ISC | transitiv | nein | [source](https://registry.npmjs.org/once/-/once-1.4.0.tgz) |
| p-cancelable | 2.1.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/p-cancelable/-/p-cancelable-2.1.1.tgz) |
| p-limit | 3.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/p-limit/-/p-limit-3.1.0.tgz) |
| path-is-absolute | 1.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/path-is-absolute/-/path-is-absolute-1.0.1.tgz) |
| path-key | 3.1.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz) |
| pathe | 2.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/pathe/-/pathe-2.0.3.tgz) |
| pathval | 2.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/pathval/-/pathval-2.0.1.tgz) |
| pe-library | 0.4.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/pe-library/-/pe-library-0.4.1.tgz) |
| pend | 1.2.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/pend/-/pend-1.2.0.tgz) |
| picocolors | 1.1.1 | ISC | transitiv | nein | [source](https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz) |
| picomatch | 4.0.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz) |
| plist | 3.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/plist/-/plist-3.1.0.tgz) |
| postcss | 8.5.15 | MIT | transitiv | nein | [source](https://registry.npmjs.org/postcss/-/postcss-8.5.15.tgz) |
| postject | 1.0.0-alpha.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/postject/-/postject-1.0.0-alpha.6.tgz) |
| commander | 9.5.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/commander/-/commander-9.5.0.tgz) |
| proc-log | 6.1.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/proc-log/-/proc-log-6.1.0.tgz) |
| progress | 2.0.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/progress/-/progress-2.0.3.tgz) |
| promise-retry | 2.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/promise-retry/-/promise-retry-2.0.1.tgz) |
| proper-lockfile | 4.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/proper-lockfile/-/proper-lockfile-4.1.2.tgz) |
| pump | 3.0.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/pump/-/pump-3.0.4.tgz) |
| punycode | 2.3.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz) |
| quick-lru | 5.1.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/quick-lru/-/quick-lru-5.1.1.tgz) |
| react | 19.2.6 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/react/-/react-19.2.6.tgz) |
| react-dom | 19.2.6 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/react-dom/-/react-dom-19.2.6.tgz) |
| react-refresh | 0.18.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/react-refresh/-/react-refresh-0.18.0.tgz) |
| read-binary-file-arch | 1.0.6 | MIT | transitiv | ja | [source](https://registry.npmjs.org/read-binary-file-arch/-/read-binary-file-arch-1.0.6.tgz) |
| require-directory | 2.1.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/require-directory/-/require-directory-2.1.1.tgz) |
| resedit | 1.7.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/resedit/-/resedit-1.7.2.tgz) |
| resolve-alpn | 1.2.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/resolve-alpn/-/resolve-alpn-1.2.1.tgz) |
| responselike | 2.0.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/responselike/-/responselike-2.0.1.tgz) |
| retry | 0.12.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/retry/-/retry-0.12.0.tgz) |
| rimraf | 2.6.3 | ISC | transitiv | ja | [source](https://registry.npmjs.org/rimraf/-/rimraf-2.6.3.tgz) |
| roarr | 2.15.4 | BSD-3-Clause | transitiv | nein | [source](https://registry.npmjs.org/roarr/-/roarr-2.15.4.tgz) |
| rollup | 4.60.4 | MIT | transitiv | nein | [source](https://registry.npmjs.org/rollup/-/rollup-4.60.4.tgz) |
| safer-buffer | 2.1.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz) |
| sanitize-filename | 1.6.4 | WTFPL OR ISC | transitiv | ja | [source](https://registry.npmjs.org/sanitize-filename/-/sanitize-filename-1.6.4.tgz) |
| sax | 1.6.0 | BlueOak-1.0.0 | transitiv | nein | [source](https://registry.npmjs.org/sax/-/sax-1.6.0.tgz) |
| scheduler | 0.27.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz) |
| semver | 6.3.1 | ISC | transitiv | nein | [source](https://registry.npmjs.org/semver/-/semver-6.3.1.tgz) |
| semver-compare | 1.0.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/semver-compare/-/semver-compare-1.0.0.tgz) |
| serialize-error | 7.0.1 | MIT | transitiv | nein | [source](https://registry.npmjs.org/serialize-error/-/serialize-error-7.0.1.tgz) |
| shebang-command | 2.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz) |
| shebang-regex | 3.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz) |
| siginfo | 2.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/siginfo/-/siginfo-2.0.0.tgz) |
| signal-exit | 3.0.7 | ISC | transitiv | ja | [source](https://registry.npmjs.org/signal-exit/-/signal-exit-3.0.7.tgz) |
| simple-update-notifier | 2.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/simple-update-notifier/-/simple-update-notifier-2.0.0.tgz) |
| semver | 7.8.1 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-7.8.1.tgz) |
| slice-ansi | 3.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/slice-ansi/-/slice-ansi-3.0.0.tgz) |
| smart-buffer | 4.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/smart-buffer/-/smart-buffer-4.2.0.tgz) |
| source-map | 0.6.1 | BSD-3-Clause | transitiv | ja | [source](https://registry.npmjs.org/source-map/-/source-map-0.6.1.tgz) |
| source-map-js | 1.2.1 | BSD-3-Clause | transitiv | nein | [source](https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz) |
| source-map-support | 0.5.21 | MIT | transitiv | ja | [source](https://registry.npmjs.org/source-map-support/-/source-map-support-0.5.21.tgz) |
| sprintf-js | 1.1.3 | BSD-3-Clause | transitiv | nein | [source](https://registry.npmjs.org/sprintf-js/-/sprintf-js-1.1.3.tgz) |
| stackback | 0.0.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/stackback/-/stackback-0.0.2.tgz) |
| stat-mode | 1.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/stat-mode/-/stat-mode-1.0.0.tgz) |
| std-env | 3.10.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/std-env/-/std-env-3.10.0.tgz) |
| string-width | 4.2.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/string-width/-/string-width-4.2.3.tgz) |
| strip-ansi | 6.0.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/strip-ansi/-/strip-ansi-6.0.1.tgz) |
| strip-literal | 3.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/strip-literal/-/strip-literal-3.1.0.tgz) |
| js-tokens | 9.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/js-tokens/-/js-tokens-9.0.1.tgz) |
| sumchecker | 3.0.1 | Apache-2.0 | transitiv | nein | [source](https://registry.npmjs.org/sumchecker/-/sumchecker-3.0.1.tgz) |
| supports-color | 7.2.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/supports-color/-/supports-color-7.2.0.tgz) |
| tar | 7.5.15 | BlueOak-1.0.0 | transitiv | ja | [source](https://registry.npmjs.org/tar/-/tar-7.5.15.tgz) |
| yallist | 5.0.0 | BlueOak-1.0.0 | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/yallist/-/yallist-5.0.0.tgz) |
| temp | 0.9.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/temp/-/temp-0.9.4.tgz) |
| temp-file | 3.4.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/temp-file/-/temp-file-3.4.0.tgz) |
| fs-extra | 10.1.0 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/fs-extra/-/fs-extra-10.1.0.tgz) |
| jsonfile | 6.2.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/jsonfile/-/jsonfile-6.2.1.tgz) |
| universalify | 2.0.1 | MIT | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/universalify/-/universalify-2.0.1.tgz) |
| tiny-async-pool | 1.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tiny-async-pool/-/tiny-async-pool-1.3.0.tgz) |
| semver | 5.7.2 | ISC | transitiv (verschachtelt) | ja | [source](https://registry.npmjs.org/semver/-/semver-5.7.2.tgz) |
| tiny-typed-emitter | 2.1.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/tiny-typed-emitter/-/tiny-typed-emitter-2.1.0.tgz) |
| tinybench | 2.9.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tinybench/-/tinybench-2.9.0.tgz) |
| tinyexec | 0.3.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tinyexec/-/tinyexec-0.3.2.tgz) |
| tinyglobby | 0.2.16 | MIT | transitiv | nein | [source](https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.16.tgz) |
| tinypool | 1.1.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tinypool/-/tinypool-1.1.1.tgz) |
| tinyrainbow | 2.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tinyrainbow/-/tinyrainbow-2.0.0.tgz) |
| tinyspy | 4.0.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tinyspy/-/tinyspy-4.0.4.tgz) |
| tldts-core | 7.4.13 | MIT | transitiv | nein | [source](https://registry.npmjs.org/tldts-core/-/tldts-core-7.4.13.tgz) |
| tldts-experimental | 7.4.13 | MIT | transitiv | nein | [source](https://registry.npmjs.org/tldts-experimental/-/tldts-experimental-7.4.13.tgz) |
| tmp | 0.2.5 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tmp/-/tmp-0.2.5.tgz) |
| tmp-promise | 3.0.3 | MIT | transitiv | ja | [source](https://registry.npmjs.org/tmp-promise/-/tmp-promise-3.0.3.tgz) |
| truncate-utf8-bytes | 1.0.2 | WTFPL | transitiv | ja | [source](https://registry.npmjs.org/truncate-utf8-bytes/-/truncate-utf8-bytes-1.0.2.tgz) |
| type-fest | 0.13.1 | (MIT OR CC0-1.0) | transitiv | nein | [source](https://registry.npmjs.org/type-fest/-/type-fest-0.13.1.tgz) |
| typescript | 5.9.3 | Apache-2.0 | direkt (development) | ja | [source](https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz) |
| undici | 6.25.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/undici/-/undici-6.25.0.tgz) |
| undici-types | 6.21.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/undici-types/-/undici-types-6.21.0.tgz) |
| universalify | 0.1.2 | MIT | transitiv | nein | [source](https://registry.npmjs.org/universalify/-/universalify-0.1.2.tgz) |
| update-browserslist-db | 1.2.3 | MIT | transitiv | nein | [source](https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz) |
| uri-js | 4.4.1 | BSD-2-Clause | transitiv | ja | [source](https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz) |
| utf8-byte-length | 1.0.5 | (WTFPL OR MIT) | transitiv | ja | [source](https://registry.npmjs.org/utf8-byte-length/-/utf8-byte-length-1.0.5.tgz) |
| verror | 1.10.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/verror/-/verror-1.10.1.tgz) |
| vite | 7.3.3 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/vite/-/vite-7.3.3.tgz) |
| vite-node | 3.2.4 | MIT | transitiv | ja | [source](https://registry.npmjs.org/vite-node/-/vite-node-3.2.4.tgz) |
| vitest | 3.2.4 | MIT | direkt (development) | ja | [source](https://registry.npmjs.org/vitest/-/vitest-3.2.4.tgz) |
| which | 5.0.0 | ISC | transitiv | ja | [source](https://registry.npmjs.org/which/-/which-5.0.0.tgz) |
| why-is-node-running | 2.3.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/why-is-node-running/-/why-is-node-running-2.3.0.tgz) |
| wrap-ansi | 7.0.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/wrap-ansi/-/wrap-ansi-7.0.0.tgz) |
| wrappy | 1.0.2 | ISC | transitiv | nein | [source](https://registry.npmjs.org/wrappy/-/wrappy-1.0.2.tgz) |
| xmlbuilder | 15.1.1 | MIT | transitiv | ja | [source](https://registry.npmjs.org/xmlbuilder/-/xmlbuilder-15.1.1.tgz) |
| y18n | 5.0.8 | ISC | transitiv | ja | [source](https://registry.npmjs.org/y18n/-/y18n-5.0.8.tgz) |
| yallist | 3.1.1 | ISC | transitiv | nein | [source](https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz) |
| yargs | 17.7.2 | MIT | transitiv | ja | [source](https://registry.npmjs.org/yargs/-/yargs-17.7.2.tgz) |
| yargs-parser | 21.1.1 | ISC | transitiv | ja | [source](https://registry.npmjs.org/yargs-parser/-/yargs-parser-21.1.1.tgz) |
| yauzl | 2.10.0 | MIT | transitiv | nein | [source](https://registry.npmjs.org/yauzl/-/yauzl-2.10.0.tgz) |
| yocto-queue | 0.1.0 | MIT | transitiv | ja | [source](https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz) |
| zustand | 5.0.15 | MIT | direkt (runtime) | nein | [source](https://registry.npmjs.org/zustand/-/zustand-5.0.15.tgz) |

## Python-Laufzeit (Windows, gepinnt)

Die Spalte `direkt` bezieht sich auf die Deklaration in `services/sidekick/pyproject.toml`, nicht auf die Ebene im Installationsgraphen.

| Paket | Version | Lizenz | direkt | Beleg | Quelle |
| :--- | :--- | :--- | :--- | :--- | :--- |
| annotated-doc | 0.0.5 | MIT | nein | pypi-ok | [source](https://pypi.org/project/annotated-doc/0.0.5/) |
| annotated-types | 0.8.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/annotated-types/0.8.0/) |
| anthropic | 1.10.0 | MIT | ja | pypi-ok | [source](https://pypi.org/project/anthropic/1.10.0/) |
| anyio | 4.15.1 | MIT | nein | pypi-ok | [source](https://pypi.org/project/anyio/4.15.1/) |
| attrs | 26.1.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/attrs/26.1.0/) |
| certifi | 2026.7.22 | MPL-2.0 | nein | pypi-ok | [source](https://pypi.org/project/certifi/2026.7.22/) |
| cffi | 2.1.1 | MIT-0 | nein | pypi-ok | [source](https://pypi.org/project/cffi/2.1.1/) |
| charset-normalizer | 3.5.2 | MIT | nein | pypi-ok | [source](https://pypi.org/project/charset-normalizer/3.5.2/) |
| click | 8.5.0 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/click/8.5.0/) |
| colorama | 0.4.6 | License :: OSI Approved :: BSD License (classifier only) | nein | pypi-classifier-only (classifier-only) (classifier-only) (classifier-only) (classifier-only) | [source](https://pypi.org/project/colorama/0.4.6/) |
| croniter | 6.2.4 | MIT | ja | pypi-ok | [source](https://pypi.org/project/croniter/6.2.4/) |
| cryptography | 50.0.2 | Apache-2.0 OR BSD-3-Clause | ja | pypi-ok | [source](https://pypi.org/project/cryptography/50.0.2/) |
| distro | 1.9.0 | Apache License, Version 2.0 | nein | pypi-ok | [source](https://pypi.org/project/distro/1.9.0/) |
| docstring_parser | 0.18.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/docstring_parser/0.18.0/) |
| fastapi | 0.142.2 | MIT | ja | pypi-ok | [source](https://pypi.org/project/fastapi/0.142.2/) |
| fire | 0.7.1 | Apache-2.0 | ja | pypi-ok | [source](https://pypi.org/project/fire/0.7.1/) |
| h11 | 0.16.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/h11/0.16.0/) |
| httpcore | 1.0.9 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/httpcore/1.0.9/) |
| httpcore2 | 2.13.1 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/httpcore2/2.13.1/) |
| httptools | 0.8.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/httptools/0.8.0/) |
| httpx | 0.28.1 | BSD-3-Clause | ja | pypi-ok | [source](https://pypi.org/project/httpx/0.28.1/) |
| httpx-sse | 0.4.3 | MIT | nein | pypi-ok | [source](https://pypi.org/project/httpx-sse/0.4.3/) |
| httpx2 | 2.13.1 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/httpx2/2.13.1/) |
| idna | 3.20 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/idna/3.20/) |
| jiter | 0.17.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/jiter/0.17.0/) |
| jsonschema | 4.26.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/jsonschema/4.26.0/) |
| jsonschema-specifications | 2025.9.1 | MIT | nein | pypi-ok | [source](https://pypi.org/project/jsonschema-specifications/2025.9.1/) |
| markdown-it-py | 4.2.0 | License :: OSI Approved :: MIT License (classifier only) | nein | pypi-classifier-only (classifier-only) (classifier-only) (classifier-only) (classifier-only) | [source](https://pypi.org/project/markdown-it-py/4.2.0/) |
| mcp | 1.26.0 | MIT | ja | pypi-ok | [source](https://pypi.org/project/mcp/1.26.0/) |
| mdurl | 0.1.2 | License :: OSI Approved :: MIT License (classifier only) | nein | pypi-classifier-only (classifier-only) (classifier-only) (classifier-only) (classifier-only) | [source](https://pypi.org/project/mdurl/0.1.2/) |
| openai | 2.54.0 | Apache-2.0 | ja | pypi-ok | [source](https://pypi.org/project/openai/2.54.0/) |
| opentelemetry-api | 1.45.0 | Apache-2.0 | nein | pypi-ok | [source](https://pypi.org/project/opentelemetry-api/1.45.0/) |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause | ja | pypi-ok | [source](https://pypi.org/project/packaging/26.3/) |
| prompt_toolkit | 3.0.53 | License :: OSI Approved :: BSD License (classifier only) | ja | pypi-classifier-only (classifier-only) (classifier-only) (classifier-only) (classifier-only) | [source](https://pypi.org/project/prompt_toolkit/3.0.53/) |
| pycparser | 3.0 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/pycparser/3.0/) |
| pydantic | 2.13.5 | MIT | nein | pypi-ok | [source](https://pypi.org/project/pydantic/2.13.5/) |
| pydantic_core | 2.46.5 | MIT | nein | pypi-ok | [source](https://pypi.org/project/pydantic_core/2.46.5/) |
| pydantic-settings | 2.15.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/pydantic-settings/2.15.0/) |
| Pygments | 2.21.0 | BSD-2-Clause | nein | pypi-ok | [source](https://pypi.org/project/Pygments/2.21.0/) |
| PyJWT | 2.15.1 | MIT | nein | pypi-ok | [source](https://pypi.org/project/PyJWT/2.15.1/) |
| python-dateutil | 2.9.0.post0 | Dual License | nein | pypi-ok | [source](https://pypi.org/project/python-dateutil/2.9.0.post0/) |
| python-dotenv | 1.2.4 | BSD-3-Clause | ja | pypi-ok | [source](https://pypi.org/project/python-dotenv/1.2.4/) |
| python-multipart | 0.0.32 | Apache-2.0 | nein | pypi-ok | [source](https://pypi.org/project/python-multipart/0.0.32/) |
| pywin32 | 312 | PSF | nein | pypi-ok | [source](https://pypi.org/project/pywin32/312/) |
| PyYAML | 6.0.3 | MIT | ja | pypi-ok | [source](https://pypi.org/project/PyYAML/6.0.3/) |
| referencing | 0.37.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/referencing/0.37.0/) |
| requests | 2.34.2 | Apache-2.0 | ja | pypi-ok | [source](https://pypi.org/project/requests/2.34.2/) |
| rich | 15.0.0 | MIT | ja | pypi-ok | [source](https://pypi.org/project/rich/15.0.0/) |
| rpds-py | 2026.6.3 | MIT | nein | pypi-ok | [source](https://pypi.org/project/rpds-py/2026.6.3/) |
| setuptools | 84.0.0 | MIT | ja | pypi-ok | [source](https://pypi.org/project/setuptools/84.0.0/) |
| six | 1.17.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/six/1.17.0/) |
| sniffio | 1.3.1 | MIT OR Apache-2.0 | nein | pypi-ok | [source](https://pypi.org/project/sniffio/1.3.1/) |
| sse-starlette | 3.5.0 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/sse-starlette/3.5.0/) |
| starlette | 1.7.0 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/starlette/1.7.0/) |
| termcolor | 3.3.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/termcolor/3.3.0/) |
| tqdm | 4.70.1 | MPL-2.0 AND MIT | nein | pypi-ok | [source](https://pypi.org/project/tqdm/4.70.1/) |
| truststore | 0.10.4 | MIT | nein | pypi-ok | [source](https://pypi.org/project/truststore/0.10.4/) |
| typing_extensions | 4.16.0 | PSF-2.0 | nein | pypi-ok | [source](https://pypi.org/project/typing_extensions/4.16.0/) |
| typing-inspection | 0.4.4 | MIT | nein | pypi-ok | [source](https://pypi.org/project/typing-inspection/0.4.4/) |
| tzdata | 2026.4 | Apache-2.0 | ja | pypi-ok | [source](https://pypi.org/project/tzdata/2026.4/) |
| urllib3 | 2.8.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/urllib3/2.8.0/) |
| uvicorn | 0.54.0 | BSD-3-Clause | ja | pypi-ok | [source](https://pypi.org/project/uvicorn/0.54.0/) |
| watchfiles | 1.3.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/watchfiles/1.3.0/) |
| wcwidth | 0.9.1 | License :: OSI Approved :: MIT License (classifier only) | ja | pypi-classifier-only (classifier-only) (classifier-only) (classifier-only) (classifier-only) | [source](https://pypi.org/project/wcwidth/0.9.1/) |
| websockets | 17.1 | BSD-3-Clause | nein | pypi-ok | [source](https://pypi.org/project/websockets/17.1/) |
| wheel | 0.48.0 | MIT | nein | pypi-ok | [source](https://pypi.org/project/wheel/0.48.0/) |

## Python-Lizenzverteilung

| Lizenzangabe | Pakete |
| :--- | :--- |
| MIT | 32 |
| BSD-3-Clause | 12 |
| Apache-2.0 | 6 |
| classifier-only: License :: OSI Approved :: MIT License | 3 |
| classifier-only: License :: OSI Approved :: BSD License | 2 |
| Apache License, Version 2.0 | 1 |
| Apache-2.0 OR BSD-2-Clause | 1 |
| Apache-2.0 OR BSD-3-Clause | 1 |
| BSD-2-Clause | 1 |
| Dual License | 1 |
| MIT OR Apache-2.0 | 1 |
| MIT-0 | 1 |
| MPL-2.0 | 1 |
| MPL-2.0 AND MIT | 1 |
| PSF | 1 |
| PSF-2.0 | 1 |

## Python-Namen ohne Pin

Diese Namen stehen in `services/sidekick/pyproject.toml`, fehlen aber in der gepinnten Laufzeitdatei. Ohne Version wird keine Lizenz behauptet.

- numpy
- chromadb
- sentence-transformers
- python-telegram-bot
- aiohttp
- playwright
- pillow
- tiktoken
- beautifulsoup4
- pytest
- ruff
- build
- coverage

## Gebündelte Laufzeiten und Binärdateien

| Komponente | Version | Dateien | Lizenz | Quelle | Beleg |
| :--- | :--- | :--- | :--- | :--- | :--- |
| llama.cpp runtime (CPU and Vulkan) | b11377 | apps/desktop/vendor/local-ai/llama-b11377-bin-win-cpu-x64.zip<br>apps/desktop/vendor/local-ai/llama-b11377-bin-win-vulkan-x64.zip | MIT | [source](https://github.com/ggml-org/llama.cpp) | apps/desktop/vendor/local-ai/LICENSE-llama.cpp; archive SHA-256 pinned in runtime-lock.json |
| LLVM OpenMP runtime (libomp.dll) | shipped inside llama.cpp b11377 archives | apps/desktop/vendor/local-ai/llama-b11377-bin-win-cpu-x64.zip -> libomp.dll<br>apps/desktop/vendor/local-ai/llama-b11377-bin-win-vulkan-x64.zip -> libomp.dll | Apache-2.0 WITH LLVM-exception | [source](https://llvm.org/) | LICENSE-LLVM-OpenMP inside each llama.cpp archive; not extracted into the repository tree |
| CastLabs Electron shell | 37.10.3+wvcus | Electron runtime shipped with the desktop app | MIT | [source](https://github.com/castlabs/electron-releases) | apps/desktop/package.json devDependencies plus package-lock.json entry node_modules/electron |

Widevine CDM ist proprietäre Drittsoftware von Google. Sie liegt nicht im Repository und wird nicht mit dem Installer gebündelt, sondern zur Laufzeit über die CastLabs-Electron-Schicht geladen. Sie ist deshalb kein Eintrag dieses Inventars.

## Schriften

| Schrift | Dateien | Lizenz | Quelle | Beleg |
| :--- | :--- | :--- | :--- | :--- |
| Atkinson Hyperlegible | apps/desktop/src/renderer/assets/fonts/Atkinson-Hyperlegible-*.woff2 | OFL-1.1 | [source](https://github.com/googlefonts/atkinson-hyperlegible) | A-020 audit section 4.4; no license text stored in the repository tree |
| Lexend | apps/desktop/src/renderer/assets/fonts/Lexend-*.woff2 | OFL-1.1 | [source](https://github.com/googlefonts/lexend) | A-020 audit section 4.4; no license text stored in the repository tree |
| OpenDyslexic | apps/desktop/src/renderer/assets/fonts/OpenDyslexic-*.woff2 | OFL-1.1 | [source](https://github.com/antijingoist/opendyslexic) | apps/desktop/src/renderer/assets/fonts/OpenDyslexic-OFL.txt and OpenDyslexic-SOURCE.txt; pinned revision in SOURCE.txt |
| Inter | lastbrowser.com/assets/fonts/inter-var.woff2 | OFL-1.1 | [source](https://github.com/rsms/inter) | A-020 audit section 4.4; no license text stored in the repository tree |
| Outfit | lastbrowser.com/assets/fonts/outfit-var.woff2 | OFL-1.1 | [source](https://github.com/Outfitio/Outfit-Fonts) | A-020 audit section 4.4; no license text stored in the repository tree |
| KaTeX fonts | services/sidekick/web/static/vendor/katex/fonts/* | OFL-1.1 | [source](https://github.com/KaTeX/KaTeX) | A-020 audit section 4.4; KaTeX code is MIT, bundled font files are OFL-1.1; no license text stored in the repository tree |

## Gebündelte Web-Assets der Sidekick-Oberfläche

Diese Dateien werden mit `services/**/*` als Electron-`extraResources` ausgeliefert. Die Versionsangaben stammen aus den Pins in `services/sidekick/web/static/index.html` oder aus `services/sidekick/docs/webui-performance-backlog.md` (Backlog-Item 14).

| Komponente | Version | Dateien | Lizenz | Quelle | Beleg |
| :--- | :--- | :--- | :--- | :--- | :--- |
| streaming-markdown (smd.min.js) | 0.2.15 | services/sidekick/web/static/vendor/smd.min.js | MIT | [source](https://github.com/thetarnav/streaming-markdown) | services/sidekick/web/static/index.html pins npm version and records sha384 T6r95ocN9t3W8tUK2Fa6FPaO7bJryyjyW0WCalrUnpgtm2qXr5xcN4vwPYEJ6vHa |
| Prism.js | 1.29.0 | services/sidekick/web/static/vendor/prism/** | MIT | [source](https://github.com/PrismJS/prism) | services/sidekick/web/static/index.html comment pins npm:prismjs@1.29.0; license metadata from npm registry |
| xterm.js and addons | 5.3.0 | services/sidekick/web/static/vendor/xterm/** and services/sidekick/web/static/xterm.css | MIT | [source](https://github.com/xtermjs/xterm.js) | services/sidekick/web/static/index.html comment pins npm:xterm@5.3.0; xterm.css carries the MIT notice |
| KaTeX | 0.16.22 | services/sidekick/web/static/vendor/katex/katex.min.js and katex.min.css | MIT (code); bundled fonts OFL-1.1 | [source](https://github.com/KaTeX/KaTeX) | services/sidekick/web/static/index.html comment pins npm:katex@0.16.22; font license listed separately under Schriften |
| js-yaml | 4.1.0 | services/sidekick/web/static/vendor/js-yaml/js-yaml.min.js | MIT | [source](https://github.com/nodeca/js-yaml) | Bundled file header: js-yaml 4.1.0, @license MIT |
| Mermaid | 10.9.3 | services/sidekick/web/static/vendor/mermaid/mermaid.min.js | MIT | [source](https://github.com/mermaid-js/mermaid) | services/sidekick/docs/webui-performance-backlog.md item 14 records Mermaid 10.9.3; license metadata from npm registry |
| pdfjs-dist | 4.9.155 | services/sidekick/web/static/vendor/pdfjs/pdf.min.mjs and pdf.worker.min.mjs | Apache-2.0 | [source](https://github.com/mozilla/pdf.js) | services/sidekick/docs/webui-performance-backlog.md item 14 records pdfjs-dist 4.9.155; Apache-2.0 notice in the bundled file header |

## Icon-Sets

Alle Sets liegen als einzelne SVG-Dateien unter `services/sidekick/web/static/icons/` und werden über `icons.js` geladen.

| Set | Dateien | Lizenz | Quelle | Beleg | Hinweis |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Skill Icons | services/sidekick/web/static/icons/si/*.svg (24 files) | MIT | [source](https://github.com/tandpfun/skill-icons) | loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry | Brand logos remain trademarks of their respective owners. |
| Devicon | services/sidekick/web/static/icons/di/*.svg (27 files) | MIT | [source](https://github.com/devicons/devicon) | loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry | Brand logos remain trademarks of their respective owners. |
| Phosphor Icons | services/sidekick/web/static/icons/ph/*.svg (15 files) | MIT | [source](https://github.com/phosphor-icons/core) | loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry |  |
| Fluent Emoji Flat | services/sidekick/web/static/icons/fe/*.svg (5 files) | MIT | [source](https://github.com/microsoft/fluentui-emoji) | loader mapping in services/sidekick/web/static/icons.js; license metadata from npm registry |  |
| Lucide (inline SVG paths) | services/sidekick/web/static/icons.js | ISC | [source](https://github.com/lucide-icons/lucide) | inline LI_PATHS table in services/sidekick/web/static/icons.js; license metadata from npm registry |  |

## Lokaler Modellkatalog (optional, nutzergeladen)

Die Modelle stehen im Katalog `apps/desktop/vendor/local-ai/models.json`, werden aber erst nach einer ausdrücklichen Nutzeraktion geladen und sind nicht Teil des Installer-Payloads. Das Feld `license` in `models.json` ist Metadaten; maßgeblich ist die beigelegte Lizenzdatei.

| Modell | Repository | Revision | Lizenz | Lizenzdatei | Quelle |
| :--- | :--- | :--- | :--- | :--- | :--- |
| LFM2.5-1.2B-Instruct-GGUF | LiquidAI/LFM2.5-1.2B-Instruct-GGUF | 8ed288026e23958ad9dfa92d53ed773a8eee7125 | LFM Open License v1.0 | apps/desktop/vendor/local-ai/LICENSE-LFM | [source](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-Q4_K_M.gguf) |
| Qwen3-0.6B-GGUF | Qwen/Qwen3-0.6B-GGUF | 23749fefcc72300e3a2ad315e1317431b06b590a | Apache-2.0 | apps/desktop/vendor/local-ai/LICENSE-Qwen | [source](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/23749fefcc72300e3a2ad315e1317431b06b590a/Qwen3-0.6B-Q8_0.gguf) |
| Qwen3-1.7B-GGUF | Qwen/Qwen3-1.7B-GGUF | 90862c4b9d2787eaed51d12237eafdfe7c5f6077 | Apache-2.0 | apps/desktop/vendor/local-ai/LICENSE-Qwen | [source](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF/resolve/90862c4b9d2787eaed51d12237eafdfe7c5f6077/Qwen3-1.7B-Q8_0.gguf) |

Hinweis: Das LFM-Modell steht unter der LFM Open License v1.0. Diese Lizenz ist nicht OSI-anerkannt und enthält eine Commercial-Use-Schwelle. Eine Aussage zur GPL-3.0-Kompatibilität oder zur Weitergabe trifft dieses Inventar nicht.

## Ungeklärte Bestandteile

| Bestandteil | Pfad | Status | Beleg |
| :--- | :--- | :--- | :--- |
| NeuTTS-Sample-Audio | services/sidekick/tools/neutts_samples/jo.wav | Lizenz unbekannt | SHA-256 `f789bc3799e64675a6324a978a3fffb0dd7850739d232cbe3d4bbbbc9973a314`, 575990 Bytes; keine Lizenzdatei |

`jo.wav` bleibt offen. Die danebenliegende Datei `jo.txt` ist ein Neuphonic-Werbetext und keine Lizenzgewährung.

## Nicht Teil dieses Inventars

- Die Herkunfts- und Rechtekette des Sidekick-/Nous-Codes (`services/sidekick/LICENSE`, MIT). Sie ist Gegenstand von A-020 Abschnitt 3 und kein Eintrag einer Drittanbieter-Abhängigkeit.
- Die rechtliche Bewertung der GPL-3.0-Kompatibilität. Diese steht in `docs/legal/license-audit.md` (A-020).
- Die Drittanbieter-Datei und die Lizenzseite in der App. Beides folgt in A-022 (b).

