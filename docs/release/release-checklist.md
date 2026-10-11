# Lastbrowser Release-Checkliste & Versionierungsleitfaden

> **Wichtig für alle Release-Manager und Automations-Agenten:**  
> Der GitHub-Release-Workflow (`.github/workflows/release.yml`) setzt Versionsnummern **nicht** automatisch. Er prüft strikt (`fail-closed`), ob die Tag-Version (`vX.Y.Z`) exakt mit der Version in `apps/desktop/package.json` übereinstimmt:
> ```powershell
> if ($tagVersion -ne $package.version) {
>   throw "Refusing release: tag version v$tagVersion does not match desktop package version $($package.version)."
> }
> ```
> Weicht die Version ab, bricht der Workflow sofort ab. Root-`package.json` und `package-lock.json` werden von `release.yml` nicht geprüft und müssen im selben Commit synchronisiert werden.

---

## 1. Vorbereitende Versions-Synchronisation (Pre-Release)

Vor dem Setzen eines Release-Tags (`git tag vX.Y.Z`) müssen folgende Dateien konsistent auf die neue Zielversion aktualisiert werden:

1. **`apps/desktop/package.json`**: `"version": "X.Y.Z"` (Vom Release-Workflow verlangt).
2. **`package.json` (Root)**: `"version": "X.Y.Z"` (Monorepo Root-Konsistenz).
3. **`package-lock.json`**: Root- und Workspace-Einträge synchronisiert (`npm install` oder gezielter Versionsabgleich).
4. **`CHANGELOG.md`**: Abschnitt `## [X.Y.Z] - YYYY-MM-DD` mit allen Fixes und Verifikationsergebnissen ergänzt.
5. **`README.md`**: Aktualisierte Testsuite-Zahlen aus dem tatsächlichen Testlauf (`npm test`).

---

## 2. Lokale Verifikation & Quality Gates

Vor dem Push des Release-Branches müssen alle 4 Repository-Checks lokal bestanden sein:

```powershell
npm test                                 # Alle Vitest-Suiten grün (147 Suiten, 1.298 Tests)
npm run verify:store                     # 27/27 Microsoft Store Preflight-Checks bestanden
npm --workspace apps/desktop run build   # 0 TypeScript- und 0 Vite-Fehler
python -m compileall -q services/sidekick # Code 0, 0 Syntaxfehler
```

---

## 3. Tagging & Veröffentlichung

1. **Branch mergen**: Release-Commit auf den Standard-Zweig (`codex/lastbrowser-electron-shell`) bringen.
2. **Tag setzen**:
   ```powershell
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin vX.Y.Z
   ```
3. **CI-Pipeline überwachen**: Der Tag triggert `.github/workflows/release.yml`. Der Workflow validiert:
   - Tag-Format `refs/tags/vX.Y.Z`
   - Übereinstimmung mit `apps/desktop/package.json`
   - Signaturgeheimnisse (Azure Authenticode & Castlabs VMP)
   - Paketbau (`setup.exe` & `portable.exe`)
   - Veröffentlichung der Release-Assets und Prüfsummen.
