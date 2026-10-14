import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryUsageBadge } from '../src/renderer/components/MemoryUsageBadge.js';
import { OptionalAiProfileContext, OptionalAiWorkspaceContext } from '../src/renderer/optional-ai-policy.js';
import { DesktopI18nProvider } from '../src/renderer/i18n.js';

function badge(profile: string | null, workspace: string | null) {
  return renderToStaticMarkup(React.createElement(DesktopI18nProvider, null,
    React.createElement(OptionalAiProfileContext.Provider, { value: profile },
      React.createElement(OptionalAiWorkspaceContext.Provider, { value: workspace },
        React.createElement(MemoryUsageBadge, { value: { schema_version: 1, sources: [
          { id: 'local:memory:1', title: 'MEMORY.md', source: 'memory', excerpt: 'Captured note' },
          { id: 'doc-1', title: 'Document', source: 'document' }
        ] } })))));
}

describe('Home memory scope', () => {
  it('enables note and document sources in the valid empty Home workspace', () => {
    const html = badge('default', '');
    expect(html).toContain('MEMORY.md</button>');
    expect(html).toContain('Document</button>');
    expect(html).not.toContain('disabled=');
  });
  it('fails closed for unresolved workspace or profile', () => {
    expect(badge('default', null).match(/disabled=""/g)).toHaveLength(2);
    expect(badge(null, '').match(/disabled=""/g)).toHaveLength(2);
  });
  it('preserves empty scope through App and memory administration without weakening profile guards', () => {
    const app = readFileSync(resolve(__dirname, '../src/renderer/App.tsx'), 'utf8');
    const panel = readFileSync(resolve(__dirname, '../src/renderer/panels/AgentPanels.tsx'), 'utf8');
    expect(app).toContain('<OptionalAiWorkspaceContext.Provider value={activeSpacePath}>');
    expect(panel).toContain('if (!profile) return <ProfileResolutionPending />;');
    expect(panel).toContain('if (workspacePath === null) return');
    expect(panel).toContain('getMemory: () => api.getMemory({ profile, workspacePath })');
  });
});
