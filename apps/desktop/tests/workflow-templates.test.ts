import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_CATEGORIES,
  WORKFLOW_TEMPLATES,
  formatWorkflowPrompt,
  getWorkflowTemplateById,
  getWorkflowTemplatesByCategory,
  type AgenticWorkflowTemplate
} from '../src/renderer/workflow-templates.js';

describe('Phase 11.2: Agentic Workflow Templates & Quick Action Hub', () => {
  it('defines at least 5 curated workflow templates with complete metadata', () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    const expectedIds = [
      'competitor-analysis',
      'markdown-extractor',
      'table-to-csv',
      'page-audit',
      'action-items'
    ];

    for (const id of expectedIds) {
      const template = WORKFLOW_TEMPLATES.find((t) => t.id === id);
      expect(template, `Template ${id} should exist`).toBeDefined();
      expect(template?.title).toBeTruthy();
      expect(template?.description).toBeTruthy();
      expect(template?.icon).toBeTruthy();
      expect(typeof template?.promptTemplate).toBe('function');
      expect(['none', 'active_tab', 'all_tabs']).toContain(template?.requiredContext);
    }
  });

  it('validates workflow categories and category helper mappings', () => {
    const validCategories = WORKFLOW_CATEGORIES.map((c) => c.id);
    expect(validCategories).toContain('research');
    expect(validCategories).toContain('data');
    expect(validCategories).toContain('content');
    expect(validCategories).toContain('audit');

    for (const template of WORKFLOW_TEMPLATES) {
      expect(validCategories).toContain(template.category);
    }
  });

  it('requires all_tabs context and includes @tabs mention for competitor-analysis', () => {
    const template = getWorkflowTemplateById('competitor-analysis');
    expect(template).toBeDefined();
    expect(template?.requiredContext).toBe('all_tabs');
    expect(template?.category).toBe('research');

    const prompt = formatWorkflowPrompt(template!);
    expect(prompt).toContain('@tabs');
    expect(prompt).toContain('Wettbewerbs- und Preisvergleich');
    expect(prompt).toContain('Markdown-Tabelle');
  });

  it('formats markdown-extractor with YAML frontmatter and title parameterization', () => {
    const template = getWorkflowTemplateById('markdown-extractor');
    expect(template).toBeDefined();
    expect(template?.requiredContext).toBe('active_tab');
    expect(template?.category).toBe('content');

    const prompt = formatWorkflowPrompt(
      template!,
      'https://example.com/blog/ai-future',
      'Die Zukunft agentischer Browser'
    );
    expect(prompt).toContain('Zukunft agentischer Browser');
    expect(prompt).toContain('https://example.com/blog/ai-future');
    expect(prompt).toContain('YAML-Frontmatter');
    expect(prompt).toContain('Obsidian und Notion');
  });

  it('formats table-to-csv prompt requesting CSV and JSON blocks', () => {
    const template = getWorkflowTemplateById('table-to-csv');
    expect(template).toBeDefined();
    expect(template?.requiredContext).toBe('active_tab');
    expect(template?.category).toBe('data');

    const prompt = formatWorkflowPrompt(template!, 'https://shop.example.com/pricing', 'Tarifübersicht');
    expect(prompt).toContain('Tarifübersicht');
    expect(prompt).toContain('```csv');
    expect(prompt).toContain('```json');
  });

  it('formats page-audit with a11y, SEO, and structured score criteria', () => {
    const template = getWorkflowTemplateById('page-audit');
    expect(template).toBeDefined();
    expect(template?.requiredContext).toBe('active_tab');
    expect(template?.category).toBe('audit');

    const prompt = formatWorkflowPrompt(template!, 'https://mywebsite.com', 'Homepage');
    expect(prompt).toContain('Barrierefreiheit (a11y)');
    expect(prompt).toContain('SEO & Metadaten');
    expect(prompt).toContain('Score');
  });

  it('formats action-items with checkboxes and deadlines', () => {
    const template = getWorkflowTemplateById('action-items');
    expect(template).toBeDefined();
    expect(template?.requiredContext).toBe('active_tab');
    expect(template?.category).toBe('content');

    const prompt = formatWorkflowPrompt(template!, 'https://docs.google.com/meeting', 'Sprint Review Q3');
    expect(prompt).toContain('Sprint Review Q3');
    expect(prompt).toContain('- [ ]');
    expect(prompt).toContain('Action Items');
  });

  it('retrieves templates by id and handles unknown ids gracefully', () => {
    const valid = getWorkflowTemplateById('action-items');
    expect(valid?.id).toBe('action-items');

    const invalid = getWorkflowTemplateById('non-existent-id');
    expect(invalid).toBeUndefined();
  });

  it('filters workflow templates by category', () => {
    const contentTemplates = getWorkflowTemplatesByCategory('content');
    expect(contentTemplates.length).toBeGreaterThanOrEqual(2);
    expect(contentTemplates.map((t) => t.id)).toContain('markdown-extractor');
    expect(contentTemplates.map((t) => t.id)).toContain('action-items');

    const researchTemplates = getWorkflowTemplatesByCategory('research');
    expect(researchTemplates.map((t) => t.id)).toContain('competitor-analysis');
  });

  it('gracefully handles missing url and title when formatting prompts', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const promptNoArgs = formatWorkflowPrompt(template);
      expect(promptNoArgs).toBeTruthy();
      expect(typeof promptNoArgs).toBe('string');
      expect(promptNoArgs.length).toBeGreaterThan(20);
    }
  });
});
