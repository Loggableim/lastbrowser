# LastBrowser 0.1.48 — separater Testkandidat

Der Human hat 0.1.48 als nächste Testversion freigegeben. Signierung, öffentlicher Upload und Storeeinreichung sind für diesen Kandidaten noch nicht freigegeben. Die veröffentlichten 0.1.47-Artefakte bleiben unverändert.

Änderungen im Quellstand:

- Persistente Ziele explizit abschließen oder abbrechen, mit bestätigtem Speicherzustand, Revision und Schreibownerprüfung.
- Teamwork verwirft verspätete Inhalte nach Stop; Gesamtfristablauf wird als Timeout statt Benutzerabbruch behandelt.
- Akzentfarben gelten für Browser-Bedienelemente; Seitenwerkzeuge sind im vorhandenen Aktionsmenü. DevTools-Anzeige folgt geöffnetem/geschlossenem Fenster und Tabwechsel.
- Hardwareprüfung akzeptiert stabile umgeleitete Profil-Elternpfade und verwirft weiterhin verlinkte Endverzeichnisse sowie wechselnde Zielpfade.
- Der Shutdown-Watchdog verwendet den normalen Beenden-Pfad, damit die vorhandene automatische Installation vollständig heruntergeladener Updates nicht umgangen wird.

Quelltests sind keine praktische Paketabnahme. Neue Setup-, Portable-, ASAR- und Inputpins werden erst nach dem frischen 0.1.48-Build ergänzt. Reale Provider-/Guest-, Updateinstallation- und Clean-Windows-Nachweise bleiben getrennte Gates. Der native Downloadlauncher und der Zen-Websitevergleich gehören zu separaten Arbeitssträngen.
