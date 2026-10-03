# Windows Computer Use: Reparaturplan (2026-10-03)

## Regeln

Bestehenden Dirty-Checkout erhalten. Kein Commit, Push, Download oder externes
Repository. Keine Eingaben/Fensternachrichten an Benutzeranwendungen. Live-
Nachbedingungen ausschließlich an einer eigens gestarteten Testanwendung prüfen.

## Arbeitspakete

1. Lifecycle: Erststart, Timeout/EOF/Crash, Neustart, Not-Aus ohne I/O-Lock;
   Dispatch-Sperre und bestätigte Prozessbeendigung getrennt messen.
2. Freigaben: Callback fehlt → verweigern; Host-Task statt Modell-Run verwenden;
   einmalige, ablaufende Tokens an Aktion, Ziel, Snapshot und Parameter binden.
   Worker-Befehle privat authentifizieren. Shell/CDP-Tripwires zentral prüfen.
3. UIA: echte Patterns, Runtime-ID/Prozessidentität, Cache/TTL, Capture/DPI,
   Handle-Lebensdauer, SendInput-Rückgaben und UTF-16 prüfen.
4. Tool: macOS-Signatur erhalten, Snapshot/Koordinaten weiterreichen,
   Unsupported-Zustände nicht als Erfolg ausgeben, Schema abgleichen.
5. Verifikation: sichere Regressionen, kontrollierte Windows-Testanwendung,
   fehlgeschlagene Verifikation → FAIL und Nichtnull-Exitcode; anschließend
   relevante Python-Tests und die vier AGENTS.md-Gates ausführen.

## Status

Die fünf Arbeitspakete sind umgesetzt und für die unten beschriebenen Tests
verifiziert. 79 gezielte Python-Tests, der Windows-Verifier und die vier
Repository-Gates bestehen. Live-SendInput, echte ScrollPattern-Anwendungen,
macOS-Laufzeit und gebündelter Installer bleiben ausdrücklich ungetestet.
Details und Grenzen stehen in `windows-computer-use-walkthrough.md`.
