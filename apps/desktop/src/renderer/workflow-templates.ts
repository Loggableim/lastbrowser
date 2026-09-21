/**
 * Agentic Workflow Templates & Quick Action Hub (Phase 11.2)
 *
 * Provides curated 1-click workflows for research, extraction, auditing,
 * and data synthesis across active tabs and pages.
 */

export type WorkflowCategory = 'research' | 'data' | 'content' | 'audit';
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
  { id: 'research', label: 'Recherche & Vergleich', icon: 'Search' },
  { id: 'data', label: 'Daten & Tabellen', icon: 'Table' },
  { id: 'content', label: 'Inhalt & Notizen', icon: 'FileText' },
  { id: 'audit', label: 'Audit & Barrierefreiheit', icon: 'ShieldCheck' }
];

export const WORKFLOW_TEMPLATES: AgenticWorkflowTemplate[] = [
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
    id: 'markdown-extractor',
    title: 'Artikel als Clean Markdown archivieren',
    description: 'Bereinigt Werbung, Navigationsleisten, Footer und erzeugt sauberes Obsidian/Notion-kompatibles Markdown.',
    icon: 'FileText',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) => {
      const pageRef = title ? `„${title}“ (${url || 'aktive Seite'})` : (url || 'die aktuelle Seite');
      return (
        `Extrahiere den Hauptinhalt für ${pageRef} als sauberes, strukturiertes Markdown, optimiert für Obsidian und Notion.\n\n` +
        `Anforderungen:\n` +
        `1. Beginne mit einem YAML-Frontmatter-Header:\n` +
        `---\n` +
        `title: "${title || 'Notiz'}"\n` +
        `source: "${url || ''}"\n` +
        `date: "${new Date().toISOString().slice(0, 10)}"\n` +
        `tags: [archiv, web-clipper]\n` +
        `---\n\n` +
        `2. Entferne restlos alle Werbebanner, Cookie-Hinweise, Navigationselemente, Autoren-Sidebars und Footer.\n` +
        `3. Behalte alle hierarchischen Überschriften (H1-H4), Zitate, Codeblöcke und relevanten Text-Links bei.\n` +
        `4. Gib ausschließlich das fertige Markdown aus.`
      );
    }
  },
  {
    id: 'table-to-csv',
    title: 'Tabellen erkennen & als CSV/JSON exportieren',
    description: 'Sucht HTML-Tabellen der aktuellen Seite und konvertiert sie strukturiert in CSV- und JSON-Blöcke.',
    icon: 'Table',
    category: 'data',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) => {
      const pageRef = title ? `„${title}“` : (url || 'aktuelle Seite');
      return (
        `Scanne ${pageRef} nach allen tabellarischen Daten, Preisübersichten und Listen.\n\n` +
        `Aufgabenstellung:\n` +
        `1. Konvertiere jede gefundene Tabelle zuerst in eine saubere, kommagetrennte CSV in einem \`\`\`csv Codeblock.\n` +
        `2. Überführe dieselben Daten zusätzlich in ein valides JSON-Array im \`\`\`json Codeblock mit aussagekräftigen Key-Namen.\n` +
        `3. Bereinige Währungszeichen, Tausendertrennzeichen und normalisiere Datumsangaben.\n` +
        `4. Falls mehrere Tabellen vorhanden sind, versehe jeden Block mit einer passenden Überschrift.`
      );
    }
  },
  {
    id: 'page-audit',
    title: 'Barrierefreiheits-, Performance- & SEO-Audit',
    description: 'Analysiert Headings, Alt-Tags, Kontraste, Lesbarkeit und Meta-Tags der aktuellen Seite.',
    icon: 'ShieldAlert',
    category: 'audit',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) => {
      const pageRef = title ? `„${title}“` : (url || 'aktuelle Seite');
      return (
        `Führe ein gründliches Qualitäts- und Struktur-Audit für ${pageRef} durch:\n\n` +
        `Prüfpunkte:\n` +
        `1. Barrierefreiheit (a11y): Überschriften-Hierarchie (H1-H6 ohne Sprünge), Bildbeschreibungen/Alt-Attribute, Formular-Labels.\n` +
        `2. SEO & Metadaten: Titel-Länge, Meta-Description, OpenGraph-Tags, Canonical-Links.\n` +
        `3. Lesbarkeit & Struktur: Text-zu-Code-Verhältnis, Absatzlängen, Klarheit der Call-to-Actions.\n\n` +
        `Ausgabe:\n` +
        `- Tabelle mit Score pro Kategorie (0–100 %)\n` +
        `- Liste konkreter Stärken (✓)\n` +
        `- Liste priorisierter Handlungsempfehlungen (⚠️)`
      );
    }
  },
  {
    id: 'action-items',
    title: 'Meeting-Notes & To-dos extrahieren',
    description: 'Filtert Deadlines, Zuständigkeiten und Bullet-Points aus Notizen, Protokollen oder Tickets.',
    icon: 'CheckSquare',
    category: 'content',
    requiredContext: 'active_tab',
    promptTemplate: (url, title) => {
      const pageRef = title ? `„${title}“` : (url || 'aktuelle Seite');
      return (
        `Analysiere den Inhalt von ${pageRef} und extrahiere alle relevanten Aufgaben, Beschlüsse und Fristen.\n\n` +
        `Strukturiere das Ergebnis wie folgt:\n` +
        `### 📌 Kernaussagen & Beschlüsse (3–5 Bullet-Points)\n\n` +
        `### ✅ Action Items\n` +
        `- [ ] **[Zuständige Person/Rolle]** Konkrete Aufgabe (Frist: YYYY-MM-DD oder 'Zeitnah')\n\n` +
        `### ❓ Offene Fragen & Klärungsbedarf\n` +
        `Listenpunkte für ungelöste Abhängigkeiten oder Unklarheiten.`
      );
    }
  }
];

export function getWorkflowTemplateById(id: string): AgenticWorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find((t) => t.id === id);
}

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
