# FIX AGENT 3 – Quickchat Main/Backend

## Vertrag

- Main akzeptiert Quickchat-Start nur von einem vertrauenswürdigen Shell-Frame und löst Browserprofil, Space, Backendprofil sowie Workspace über die gespeicherte Binding-Auflösung auf. Der Renderer kann Scope oder Profil nicht als Berechtigung bestimmen.
- Schnellchat nutzt die vorhandene Sidekick-Chatstream-/SSE-Engine mit einer explizit als `session_kind="quickchat"` markierten privaten Session. Kontextfelder sind begrenzt; Seitenmaterial wird als nicht vertrauenswürdige Referenz gekennzeichnet. Toolsets, Goals, Hintergrundtitel und Goal-/Journal-Autonomie sind für diese Session deaktiviert.
- Private Sessions werden aus beiden Pfaden von `all_sessions()` herausgefiltert, einschließlich veralteter kompakter Indizes.
- `quickChat.stop({quickChatId, streamId, scope})` stoppt ausschließlich den gebundenen aktuellen Stream und bewahrt Transkript und Session. `quickChat.cancel(...)` löscht/resettiert die private Session. Nach Stop darf Reset die leere Stream-ID verwenden, wenn Main und Backend keinen aktiven Stream mehr führen.
- Renderer-Teardown schließt den SSE-Reader und setzt die zugehörige private Session zurück; Events eines alten oder zurückgesetzten Streams werden nicht weitergereicht.

## Gezielte Verifikation

- `pytest -q -p no:cacheprovider services/sidekick/tests/test_quickchat.py` – 5 bestanden.
- `npm --workspace apps/desktop exec vitest -- run tests/quick-chat-controller.test.ts` – 6 bestanden. Sandboxstart zunächst mit `spawn EPERM`; derselbe gezielte Test lief nach Ausführungsfreigabe erfolgreich.
- `npx tsc --noEmit -p apps/desktop/tsconfig.main.json` – bestanden.

Nicht ausgeführt: Gesamtsuite, Renderer-Typecheck/Build, Paketierung, Live-WebUI oder Benutzerprofiltests. Es erfolgten keine Commits, Pushes, Installationen oder Profiländerungen.
