import { describe, expect, it } from 'vitest';
import { webuiEndpointGroups } from '../src/renderer/webui-endpoints.js';

function allEndpoints(): string[] {
  return webuiEndpointGroups.flatMap((group) => group.actions.map((action) => action.path));
}

describe('native WebUI API endpoint catalog', () => {
  it('covers the remaining WebUI feature groups with native bridge actions', () => {
    const paths = allEndpoints();

    [
      '/api/session/export',
      '/api/session/import',
      '/api/session/retry',
      '/api/session/branch',
      '/api/approval/pending',
      '/api/commands/exec',
      '/api/projects',
      '/api/space/config',
      '/api/file/raw',
      '/api/rollback/restore',
      '/api/kanban/boards',
      '/api/kanban/events/stream',
      '/api/browser/state',
      '/api/browser/control',
      '/api/terminal/start',
      '/api/providers',
      '/api/mcp/tools',
      '/api/system/health',
      '/api/updates/apply',
      '/api/gmail/stream',
      '/api/discord/config',
      '/api/appstore/detail',
      '/api/evey/dashboard'
    ].forEach((path) => {
      expect(paths).toContain(path);
    });
  });

  it('marks destructive or privileged endpoints as dangerous', () => {
    const dangerous = webuiEndpointGroups
      .flatMap((group) => group.actions)
      .filter((action) => action.dangerous)
      .map((action) => action.path);

    [
      '/api/session/delete',
      '/api/rollback/restore',
      '/api/system/shutdown',
      '/api/system/restart',
      '/api/updates/apply',
      '/api/discord/ban',
      '/api/discord/purge'
    ].forEach((path) => {
      expect(dangerous).toContain(path);
    });
  });

  it('keeps every catalog action scoped to a native sidebar panel', () => {
    for (const group of webuiEndpointGroups) {
      expect(group.panel).toBeTruthy();
      expect(group.actions.length).toBeGreaterThan(0);
      for (const action of group.actions) {
        expect(action.panel).toBe(group.panel);
        expect(action.path.startsWith('/api/')).toBe(true);
      }
    }
  });
});
