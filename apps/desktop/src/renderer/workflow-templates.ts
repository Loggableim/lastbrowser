/**
 * Agentic Workflow Templates & Quick Action Hub (Phase 11.2 & Phase 13)
 *
 * Provides curated 1-click workflows for research, extraction, auditing,
 * coding, and data synthesis across active tabs and pages.
 * 4 categories with at least 12 specialized skills each (48 skills total).
 */

export type WorkflowCategory = 'research' | 'content' | 'code' | 'data' | 'audit';
export type WorkflowContextRequirement = 'none' | 'active_tab' | 'all_tabs';

export interface AgenticWorkflowTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: WorkflowCategory;
  promptTemplate: (activeUrl?: string, activeTitle?: string) => string;
  requiredContext: WorkflowContextRequirement;
}

export const WORKFLOW_CATEGORIES: Array<{ id: WorkflowCategory; label: string; icon: string }> = [
  { id: 'research', label: 'Recherche & Analyse', icon: 'Search' },
  { id: 'content', label: 'Content & Notizen', icon: 'FileText' },
  { id: 'code', label: 'Code & Engineering', icon: 'Code' },
  { id: 'data', label: 'Daten & Tabellen', icon: 'Table' },
  { id: 'audit', label: 'Audit & Barrierefreiheit', icon: 'ShieldCheck' }
];

export const WORKFLOW_TEMPLATES: AgenticWorkflowTemplate[] = [
  // ==========================================
  // 1. RECHERCHE & ANALYSE (12 Skills)
  // ==========================================
  {
    id: 'competitor-analysis',
    title: 'Wettbewerber- & Preisvergleich',
    description: 'Extrahiert Preise, Features, Vor-/Nachteile in eine Markdown-Tabelle über alle offenen Tabs (@tabs).',
    icon: 'Scale',
    category: 'research',
    requiredContext: 'all_tabs',
    promptTemplate: (_url, _title) =>
      `@tabs Führe einen strukturierten Wettbewerbs- und Preisvergleich der geöffneten Anbieter-Tabs durch.\n\n` +
      `Erstelle eine detaillierte Markdown-Tabelle mit folgenden Spalten:\n` +
      `| Anbieter / Produkt | Preis & Abrechnungsmodell | Kern-Features & USPs | Vorteile | Nachteile / Limitierungen |\n\n` +
      `Analysiere die Tabs gründlich und belege Aussagen mit Zitat-Badges [Tab X: ...]. ` +
      `Schließe mit einem prägnanten Fazit und einer Empfehlung für unterschiedliche Anwendungsfälle ab.`
  },
  {
    id: 'cross-tab-synthesis',
    title: 'Cross-Tab Quellensynthese',
    description: 'Führt Argumente, Zahlen und Thesen aller offenen Tabs zu einer kohärenten Analyse zusammen.',
    icon: 'Layers',
    category: 'research',
    requiredContext: 'all_tabs',
    promptTemplate: () =>
      `@tabs Führe eine Synthese aller aktuell geöffneten Tabs durch. ` +
      `Identifiziere gemeinsame Schnittmengen, widersprüchliche Aussagen und erstelle eine gegliederte Zusammenfassung mit Zitaten [Tab X: ...].`
  },
  {
    id: 'fact-check-audit',
    title: 'Fact-Checking & Primärquellen-Audit',
    description: 'Prüft Behauptungen und Zahlen der Seite auf Plausibilität und Quellennachweise.',
    icon: 'CheckCheck',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) =>
      `Analysiere die Faktenlage und Primärquellen für „${title || url || 'diese Seite'}“. ` +
      `Kennzeichne unbewiesene Behauptungen, prüfe statistische Angaben und erstelle eine Zuverlässigkeitsbewertung (Reliability Score 1-100).`
  },
  {
    id: 'market-trend-report',
    title: 'Trend- & Marktforschungs-Report',
    description: 'Extrahiert Markttrends, Wachstumsraten und Zukunftsprognosen.',
    icon: 'TrendingUp',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Erstelle aus den Inhalten von „${title || 'dieser Seite'}“ einen kompakten Marktforschungs-Report: ` +
      `1. Identifizierte Megatrends, 2. Treiber & Hemmnisse, 3. Marktpotenzial & Zielgruppen, 4. Strategische Empfehlungen.`
  },
  {
    id: 'paper-summarizer',
    title: 'Wissenschaftlicher Paper-Summarizer',
    description: 'Strukturiert Papers nach Hypothese, Methodik, Resultaten und Limitationen.',
    icon: 'GraduationCap',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Fasse dieses Paper bzw. diese Studie „${title || ''}“ nach akademischen Standards zusammen: ` +
      `Hypothese, Methodik/Setup, Kernbefunde (quantitativ), Limitationen und Implikationen für die Praxis.`
  },
  {
    id: 'patent-trademark',
    title: 'Patent- & Marken-Recherche',
    description: 'Sucht nach Schutzrechtsansprüchen, Patentnummern und Trademarks.',
    icon: 'Award',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (url) =>
      `Untersuche die Seite ${url || ''} nach Schutzrechtsansprüchen, erwähnten Patenten, Trademarks (TM / (R)) und geistigem Eigentum.`
  },
  {
    id: 'price-history',
    title: 'Preisverlauf & Historien-Analyse',
    description: 'Analysiert Rabatte, UVP-Vergleiche und versteckte Kosten.',
    icon: 'DollarSign',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Analysiere die Preisstruktur auf „${title || 'dieser Seite'}“: ` +
      `Grundpreis, Zusatzgebühren, Rabattstaffeln, monatliche vs. jährliche Bindung und TCO (Total Cost of Ownership).`
  },
  {
    id: 'sentiment-aggregator',
    title: 'Sentiment- & Review-Aggregator',
    description: 'Aggregiert Kundenstimmen und Erfahrungsberichte mit Stimmungsanalyse.',
    icon: 'Smile',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Analysiere alle Bewertungen, Testimonials und Kommentare auf dieser Seite. ` +
      `Erstelle eine Stimmungsverteilung (% positiv, neutral, negativ) und liste die Top-3 Lob- und Kritikpunkte auf.`
  },
  {
    id: 'compliance-check',
    title: 'Regulatorik- & Compliance-Prüfung',
    description: 'Prüft auf Einhaltung gängiger Standards (DSGVO, Impressum, AI Act).',
    icon: 'Shield',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: (url) =>
      `Prüfe die Website ${url || ''} auf regulatorische Pflichtangaben: ` +
      `Impressumspflicht, Datenschutzerklärung, Cookie-Compliance, Haftungsausschlüsse und Transparenzangaben.`
  },
  {
    id: 'seo-backlink-audit',
    title: 'SEO-Keyword- & Strukturanalyse',
    description: 'Extrahiert Haupt-Keywords, H1-H3 Struktur und interne Verlinkungen.',
    icon: 'SearchCheck',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Führe ein On-Page SEO-Audit durch: Fokus-Keywords, Dichte, Überschriften-Logik, Title/Meta-Länge und interne Link-Struktur.`
  },
  {
    id: 'timeline-creator',
    title: 'Timeline & Chronologie-Ersteller',
    description: 'Baut aus Ereignissen und Daten eine chronologische Zeitleiste.',
    icon: 'Clock',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Extrahiere alle Datumsangaben und Ereignisse aus diesem Artikel und erstelle eine chronologische Timeline (Datum -> Ereignis -> Auswirkung).`
  },
  {
    id: 'pro-contra-matrix',
    title: 'Pro- & Contra-Matrix mit Gewichtung',
    description: 'Gegenüberstellung von Argumenten mit Relevanz-Scoring.',
    icon: 'SlidersHorizontal',
    category: 'research',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle eine gewichtete Pro- & Contra-Matrix zu den auf dieser Seite diskutierten Themen oder Produkten (Skala 1-5 Sterne).`
  },

  // ==========================================
  // 2. CONTENT & DOKUMENTATION (12 Skills)
  // ==========================================
  {
    id: 'markdown-extractor',
    title: 'Artikel als Clean Markdown archivieren',
    description: 'Bereinigt Werbung, Navigation, Footer und erzeugt sauberes Obsidian/Notion-kompatibles Markdown.',
    icon: 'FileText',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) =>
      `Extrahiere den Hauptinhalt für „${title || 'Artikel'}“ (${url || 'aktuelle URL'}) als sauberes, strukturiertes Markdown, optimiert für Obsidian und Notion.\n\n` +
      `Beginne mit einem YAML-Frontmatter Header (title: "${title || ''}", source: "${url || ''}", date, tags). Entferne Werbung, Menüs und Footer restlos.`
  },
  {
    id: 'action-items',
    title: 'Meeting-Notes & To-dos extrahieren',
    description: 'Filtert Deadlines, Zuständigkeiten und Checkboxen (- [ ]).',
    icon: 'CheckSquare',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) =>
      `Extrahiere alle Handlungsaufforderungen, Deadlines und Verantwortlichkeiten aus „${title || url || 'dieser Seite'}“ in eine priorisierte To-do-Liste mit Checkboxen (- [ ]).\n\n### ✅ Action Items\n- [ ] [Zuständigkeit] Aufgabe (Frist)`
  },
  {
    id: 'executive-summary',
    title: 'Executive Summary (1-Pager)',
    description: 'Prägnante Management-Zusammenfassung mit Key Takeaways und Handlungsoptionen.',
    icon: 'Briefcase',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Schreibe ein 1-seitiges Executive Briefing für „${title || 'diese Seite'}“: ` +
      `1. Kernthese (2 Sätze), 2. Strategische Fakten, 3. Risiken & Chancen, 4. Konkrete Handlungsempfehlungen.`
  },
  {
    id: 'tldr-generator',
    title: 'TL;DR & Bullet-Point Briefing',
    description: 'Extrem kompakte 3-5 Punkte Zusammenfassung für Eilige.',
    icon: 'Zap',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle ein ultraschnelles TL;DR dieser Seite: Maximal 4 Bullet Points mit den wichtigsten Erkenntnissen.`
  },
  {
    id: 'blogpost-draft',
    title: 'Blogpost- & Tutorial-Entwurf',
    description: 'Formuliert aus technischen Webseiten oder Dokumentationen einen ansprechenden Blogartikel.',
    icon: 'Edit3',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Schreibe einen mitreißenden Blogpost basierend auf „${title || 'dieser Quelle'}“ mit packender Einleitung, Zwischenüberschriften und Fazit.`
  },
  {
    id: 'social-media-thread',
    title: 'Social Media Thread (X / LinkedIn)',
    description: 'Erstellt optimierte Posts und Threads mit Hooks, Emojis und Call-to-Action.',
    icon: 'Share2',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle aus diesem Inhalt: 1. Einen viralen X-Thread (5-7 Tweets mit Hook) und 2. Einen professionellen LinkedIn-Post mit Hashtags.`
  },
  {
    id: 'polyglot-translator',
    title: 'Fachübersetzung mit Glossar-Treue',
    description: 'Übersetzt Fachbegriffe präzise nach Deutsch unter Wahrung des Kontextes.',
    icon: 'Globe',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Übersetze den Haupttext dieser Seite in professionelles Deutsch. Behalte Fachtermini im englischen Original in Klammern bei.`
  },
  {
    id: 'changelog-generator',
    title: 'Changelog- & Release-Notes Generator',
    description: 'Filtert Features, Bugfixes und Breaking Changes heraus.',
    icon: 'ListPlus',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle Release Notes aus dieser Seite, aufgeteilt in: 🚀 Features, 🐛 Bug Fixes, ⚠️ Breaking Changes, 🛠️ Internal.`
  },
  {
    id: 'faq-generator',
    title: 'FAQ-Generator aus Seiteninhalten',
    description: 'Formuliert die 5-10 wichtigsten Fragen und Antworten.',
    icon: 'HelpCircle',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Generiere aus dieser Seite eine FAQ-Sektion mit den 8 häufigsten Nutzerfragen und präzisen, leicht verständlichen Antworten.`
  },
  {
    id: 'press-release',
    title: 'Pressemitteilungs-Formulierer',
    description: 'Erstellt professionelle Pressemitteilungen nach Standard-Journalismus-Schema.',
    icon: 'Megaphone',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Formuliere aus den Neuigkeiten auf dieser Seite eine offizielle Pressemitteilung (Ort/Datum, Lead-Absatz, Zitate, Boilerplate).`
  },
  {
    id: 'email-followup',
    title: 'E-Mail Draft & Follow-up Creator',
    description: 'Erstellt geschäftliche E-Mail-Entwürfe basierend auf Web-Angeboten.',
    icon: 'Mail',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Schreibe einen professionellen E-Mail-Entwurf (Betreff + Text), um mit dem Anbieter dieser Seite über eine Partnerschaft/Angebot zu sprechen.`
  },
  {
    id: 'presentation-outline',
    title: 'Präsentations-Gliederung (Slides)',
    description: 'Erstellt eine 10-Folien-Präsentationsstruktur mit Sprechernotizen.',
    icon: 'LayoutTemplate',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Konstruiere eine 10-Slide-Präsentation aus den Inhalten dieser Seite: Folientitel, 3 Kernaussagen pro Folie und Moderationsnotizen.`
  },
  {
    id: 'glossary-extractor',
    title: 'Glossar & Begriffserklärungs-Extraktor',
    description: 'Extrahiert Fachjargon und Abkürzungen mit Definitionen.',
    icon: 'BookOpen',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Scanne die Seite nach allen Fachbegriffen, Akronymen und Abkürzungen und erstelle ein alphabetisches Begriffs-Glossar.`
  },

  // ==========================================
  // 3. CODE & ENGINEERING (12 Skills)
  // ==========================================
  {
    id: 'code-explainer',
    title: 'Code-Erklärer mit Flowchart',
    description: 'Erklärt Algorithmen, Datenstrukturen und visualisiert Kontrollflüsse.',
    icon: 'Code',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erkläre den Code auf dieser Seite Schritt für Schritt. Erstelle zusätzlich ein Mermaid.js Flowchart (graph TD), das den Datenfluss veranschaulicht.`
  },
  {
    id: 'security-audit',
    title: 'Security & Vulnerability Audit (OWASP)',
    description: 'Prüft Code-Snippets und Web-Patterns auf bekannte Sicherheitslücken.',
    icon: 'ShieldAlert',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Führe einen Sicherheitscheck des sichtbaren Codes/der Seite durch: XSS-Vektoren, CSRF, Injections, unsichere Abhängigkeiten und Abhilfemaßnahmen.`
  },
  {
    id: 'api-spec-extractor',
    title: 'API-Spezifikations-Extraktor (OpenAPI)',
    description: 'Konvertiert Dokumentationen in valide OpenAPI/Swagger 3.0 Spezifikationen.',
    icon: 'FileCode',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Extrahiere alle Endpunkte, Parameter, Request-Bodies und Status-Codes dieser API-Dokumentation in einen validen OpenAPI 3.0 YAML-Block.`
  },
  {
    id: 'sql-query-builder',
    title: 'SQL-Query & Schema-Reverse-Engineering',
    description: 'Erstellt DDL-Tabellenschemata und passende SQL-Abfragen.',
    icon: 'Database',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Generiere aus den Daten dieser Seite ein PostgreSQL-kompatibles CREATE TABLE DDL-Schema sowie 5 nützliche analytische Abfragen.`
  },
  {
    id: 'refactor-optimizer',
    title: 'Refactoring & Performance-Tuning',
    description: 'Optimiert Laufzeitkomplexität (Big-O) und Clean-Code-Prinzipien.',
    icon: 'Cpu',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Refaktoriere den Code auf dieser Seite nach Clean-Code- und SOLID-Prinzipien. Analysiere die Zeit- und Speicherkomplexität vor und nach der Optimierung.`
  },
  {
    id: 'ts-interface-builder',
    title: 'TypeScript Interface & Zod Schema',
    description: 'Erzeugt typsichere TypeScript Typen und Zod Validierungs-Schemas.',
    icon: 'FileJson',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle aus den JSON-Daten bzw. Spezifikationen dieser Seite TypeScript Interfaces und entsprechende Zod-Validierungs-Schemas.`
  },
  {
    id: 'git-commit-helper',
    title: 'Git-Commit & PR-Description Formulierer',
    description: 'Erstellt Conventional Commits und PR-Zusammenfassungen aus Diff/Doku.',
    icon: 'GitPullRequest',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle eine saubere Pull Request Beschreibung (Motivation, Änderungen, Testplan) und Conventional Commits (feat, fix, refactor) für diese Änderung.`
  },
  {
    id: 'unit-test-builder',
    title: 'Unit-Test Generator (Vitest / Jest)',
    description: 'Schreibt vollständige Testsuiten mit Happy-Path und Edge-Cases.',
    icon: 'CheckCircle2',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Schreibe für den auf dieser Seite gezeigten Code eine vollständige Vitest-Testsuite mit 100% Testabdeckung inklusive aller Randfälle.`
  },
  {
    id: 'regex-builder',
    title: 'Regex & Parser Builder aus Beispielen',
    description: 'Generiert reguläre Ausdrücke mit Erklärung aller Flags und Groups.',
    icon: 'TerminalSquare',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Konstruiere reguläre Ausdrücke (RegEx) für die auf der Seite gezeigten Muster mit benannten Gruppen (?<name>) und ausführlicher Erklärung.`
  },
  {
    id: 'docker-ci-gen',
    title: 'Dockerfile & GitHub Actions Generator',
    description: 'Baut optimierte Multi-Stage Dockerfiles und CI/CD Workflows.',
    icon: 'Box',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle für das beschriebene Projekt ein produktionsreifes Multi-Stage Dockerfile und einen passenden GitHub Actions CI-Workflow.`
  },
  {
    id: 'shell-automator',
    title: 'Shell-Script / PowerShell Automator',
    description: 'Automatisiert wiederkehrende Aufgaben als Bash/PowerShell Script.',
    icon: 'Terminal',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Erstelle ein idempotentes PowerShell- und Bash-Skript mit Fehlerbehandlung (try/catch / set -e), um die auf dieser Seite beschriebene Prozedur zu automatisieren.`
  },
  {
    id: 'curl-to-fetch',
    title: 'cURL to Fetch / Python Requests',
    description: 'Konvertiert cURL Befehle in modernen TypeScript/Python Code.',
    icon: 'Repeat',
    category: 'code',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Konvertiere alle auf der Seite gefundenen cURL-Beispiele in 1. Modernes TypeScript (fetch mit async/await) und 2. Python (httpx).`
  },

  // ==========================================
  // 4. DATEN & TABELLEN (12 Skills)
  // ==========================================
  {
    id: 'table-to-csv',
    title: 'Tabellen erkennen & als CSV/JSON exportieren',
    description: 'Sucht HTML-Tabellen der aktuellen Seite und konvertiert sie strukturiert in CSV- und JSON-Blöcke.',
    icon: 'Table',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Scanne ${title ? `„${title}“` : 'diese Seite'} nach allen tabellarischen Daten und Preisübersichten.\n` +
      `1. Konvertiere Tabellen in kommagetrennte CSVs in \`\`\`csv Codeblöcken.\n` +
      `2. Überführe die Daten zusätzlich in ein valides JSON-Array in \`\`\`json Blöcken mit normalisierten Zahlenwerten.`
  },
  {
    id: 'lead-extractor',
    title: 'Lead- & Kontaktdaten-Extraktor',
    description: 'Filtert Namen, E-Mails, Telefonnummern, LinkedIn-Profile und Adressen heraus.',
    icon: 'UserCheck',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Extrahiere alle geschäftlichen Kontaktdaten dieser Seite in eine strukturierte Tabelle: Name, Rolle, E-Mail, Telefon, Social-Links.`
  },
  {
    id: 'data-cleanser',
    title: 'Datenbereiniger & Format-Normalisierer',
    description: 'Bereinigt fehlerhafte Datensätze, normalisiert Telefonnummern und Datumsangaben.',
    icon: 'Filter',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Bereinige und normalisiere alle auf dieser Seite gefundenen Datensätze (ISO-Datumsangaben, E.164 Telefonnummern, einheitliche Währungen).`
  },
  {
    id: 'schema-validator',
    title: 'Schema.org & JSON-LD Validator',
    description: 'Prüft strukturierte Daten auf Google Rich Results Tauglichkeit.',
    icon: 'FileCode2',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Lies alle JSON-LD und Microdata Scripts dieser Seite aus, validiere sie gegen Schema.org und zeige Optimierungspotenziale für Google Rich Snippets.`
  },
  {
    id: 'catalog-scraper',
    title: 'Preis- & Produktkatalog-Extraktor',
    description: 'Erstellt Produktlisten mit SKU, Preis, Verfügbarkeit und Bild-Links.',
    icon: 'ShoppingBag',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Strukturiere alle Produkte auf dieser Seite in einen E-Commerce Katalog (Artikelname, Preis, Währung, SKU/ID, Verfügbarkeit, Bild-URL).`
  },
  {
    id: 'form-auto-filler',
    title: 'Formular-Felder & Schema-Erkenner',
    description: 'Erkennt alle Eingabefelder und bereitet Auto-Fill Payloads vor.',
    icon: 'CheckSquare',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Analysiere das Formular auf dieser Seite: Feld-Namen, IDs, Validierungsregeln und erstelle einen Beispiel-JSON-Datensatz zum Befüllen.`
  },
  {
    id: 'image-asset-scraper',
    title: 'Bild- & Asset-URL Scraper',
    description: 'Listet hochauflösende Bild-URLs mit Alt-Texten und Dimensionen auf.',
    icon: 'Image',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Extrahiere alle Medien- und Bild-URLs dieser Seite in eine Tabelle mit Spalten: Bild-URL, Alt-Text, geschätzter Typ (Banner/Icon/Foto).`
  },
  {
    id: 'broken-link-checker',
    title: 'Broken Link & Redirect Verifier',
    description: 'Prüft Links auf tote Pfade, Weiterleitungsschleifen und unsicheres HTTP.',
    icon: 'Link2Off',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Untersuche alle ausgehenden Hyperlinks auf dieser Seite auf tote Anker, unsichere HTTP-Verbindungen und auffällige Affiliate-Redirects.`
  },
  {
    id: 'page-audit',
    title: 'Barrierefreiheits-, Performance- & SEO-Audit',
    description: 'Analysiert Headings, Alt-Tags, Kontraste, Lesbarkeit und Meta-Tags.',
    icon: 'ShieldAlert',
    category: 'audit',
    requiredContext: 'active_tab',
    promptTemplate: (_url, title) =>
      `Führe ein Qualitäts-Audit für „${title || 'diese Seite'}“ durch:\n` +
      `1. Barrierefreiheit (a11y): WCAG Kontraste, Alt-Tags, semantische Struktur.\n` +
      `2. SEO & Metadaten: Headings (H1-H6), Title-Tag, OpenGraph, Descriptions.\n` +
      `3. Performance-Hürden und Gesamt-Qualitäts-Score (1-100).`
  },
  {
    id: 'rss-feed-finder',
    title: 'RSS & Atom Feed Entdecker',
    description: 'Findet versteckte RSS/Atom/JSON-Feeds auf der Domain.',
    icon: 'Rss',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Suche im HTML-Header und Quelltext dieser Seite nach allen RSS-, Atom- oder JSON-Feed-Links und gib deren URLs aus.`
  },
  {
    id: 'gdpr-cookie-audit',
    title: 'Cookie- & Tracker-Auditor',
    description: 'Deckungsgleichheit mit Datenschutz-Bestimmungen und Drittanbieter-Skripten.',
    icon: 'EyeOff',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Identifiziere alle Tracking-Pixel, Analytics-Skripte und Third-Party Cookies auf dieser Seite und erstelle einen Datenschutz-Report.`
  },
  {
    id: 'webhook-alert-gen',
    title: 'Webhook & Monitoring-Alert Generator',
    description: 'Erstellt Benachrichtigungsregeln für Webseitenänderungen.',
    icon: 'BellRing',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: () =>
      `Definiere für diese Seite sinnvolle Überwachungsregeln (z.B. Preisänderung, Textänderung, Out-of-Stock) und generiere einen Webhook-Payload.`
  }
];

export function getWorkflowTemplate(id: string): AgenticWorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

export const getWorkflowTemplateById = getWorkflowTemplate;

export function getWorkflowTemplatesByCategory(category: WorkflowCategory): AgenticWorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter((t) => t.category === category);
}

export function formatWorkflowPrompt(
  template: AgenticWorkflowTemplate,
  activeUrl?: string,
  activeTitle?: string
): string {
  return template.promptTemplate(activeUrl, activeTitle);
}
