import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Teamwork and Smart Track settings contracts', () => {
  it('routes orchestration SSE progress into the pending chat transcript', () => {
    const app = readRendererFile('App.tsx');
    expect(app).toContain('describeOrchestrationProgress(event.event, event.data)');
    expect(app).toContain('setChatMessages(updatePending);');
    expect(app).toContain('setMessages(updatePending);');
  });

  it('uses saved enabled state to expose only enabled orchestration choices', () => {
    const copilot = readRendererFile('components/CopilotSplitView.tsx');
    expect(copilot).toContain("path: '/api/teamwork/config'");
    expect(copilot).toContain("path: '/api/smart-track/config'");
    expect(copilot).toContain('setTeamworkEnabled((teamwork as any).enabled)');
    expect(copilot).toContain('setSmartTrackEnabled((smartTrack as any).enabled)');
    expect(copilot).toContain("if (model.id === 'teamwork') return teamworkEnabled;");
    expect(copilot).toContain("if (model.id.startsWith('smart-track')) return smartTrackEnabled;");
    expect(copilot).toContain('const orchestrationDisabled =');
    expect(copilot).toContain('setSelectedModel(fallback.id);');
    expect(copilot).toContain('lastbrowser:orchestration-config-updated');
  });

  it('keeps Teamwork activation tied to the saved backend config', () => {
    const teamwork = readRendererFile('panels/TeamworkSettingsPanel.tsx');
    expect(teamwork).toContain('checked={config.enabled}');
    expect(teamwork).toContain('path: \'/api/teamwork/config\'');
    expect(teamwork).toContain('setConfig((res as any).config)');
    expect(teamwork).toContain('lastbrowser:orchestration-config-updated');
  });

  it('shows model catalog discovery without claiming every model is ready', () => {
    const teamwork = readRendererFile('panels/TeamworkSettingsPanel.tsx');
    expect(teamwork).toContain('Modelle erkannt');
    expect(teamwork).toContain('weder aktuelle Erreichbarkeit noch verfügbares Kontingent');
    expect(teamwork).not.toContain('Modell einsatzbereit');
    expect(teamwork).not.toContain('Modelle einsatzbereit');
  });

  it('exposes persisted Smart Track enabled and auto-scan values and confirms API saves', () => {
    const smartTrack = readRendererFile('panels/SmartTrackSettingsTab.tsx');
    expect(smartTrack).toContain('aria-label="Smart Track aktivieren"');
    expect(smartTrack).toContain('checked={config?.enabled ?? true}');
    expect(smartTrack).toContain('aria-label="Smart Track Auto-Scan"');
    expect(smartTrack).toContain('checked={config?.auto_scan ?? true}');
    expect(smartTrack).toContain('savedConfigRef.current = saved;');
    expect(smartTrack).toContain('setConfig(saved);');
    expect(smartTrack).toContain('setConfig(savedConfigRef.current || config);');
    expect(smartTrack).not.toContain('Spart bis zu 90 %');
    expect(smartTrack).toContain('beim Start und nach Änderungen an Provider-Schlüsseln oder Modellfreigaben in den Provider-Einstellungen im Hintergrund aktualisiert');
    expect(smartTrack).not.toContain('benötigt noch Backend-Unterstützung');
  });
});
