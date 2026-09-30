import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function readRendererFile(fileName: string): string {
  return readFileSync(path.resolve(process.cwd(), 'src/renderer', fileName), 'utf8');
}

describe('Teamwork and Smart Track settings contracts', () => {
  it('routes orchestration SSE progress into separate pending status state', () => {
    const app = readRendererFile('App.tsx');
    expect(app).toContain('describeOrchestrationProgress(event.event, event.data)');
    expect(app).toContain('applyLiveChatProgress(current, orchestrationProgress.message)');
    expect(app).not.toContain('content: orchestrationProgress.message');
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
    expect(teamwork).toContain("t('teamwork.modelPool.recognizedOne')");
    expect(teamwork).toContain("t('teamwork.modelPool.recognizedMany')");
    expect(teamwork).toContain("description={t('teamwork.modelPool.description')}");
    expect(teamwork).toContain("t('teamwork.modelPool.empty')");
    expect(teamwork).not.toContain('einsatzbereit');
  });

  it('lets users refresh the current backend provider catalog without overwriting unsaved role choices', () => {
    const teamwork = readRendererFile('panels/TeamworkSettingsPanel.tsx');
    expect(teamwork).toContain('async function refreshModelCatalog()');
    expect(teamwork).toContain("path: '/api/teamwork/status'");
    expect(teamwork).toContain('setModels((status as any).models)');
    expect(teamwork).toContain("aria-label={t('common.refresh')}");
    expect(teamwork).toContain('disabled={refreshingModels}');
    expect(teamwork).toContain('setError(err instanceof Error ? err.message : String(err))');
    expect(teamwork).not.toContain('setConfig((status as any).config)');
  });

  it('exposes persisted Smart Track enabled and auto-scan values and confirms API saves', () => {
    const smartTrack = readRendererFile('panels/SmartTrackSettingsTab.tsx');
    expect(smartTrack).toContain("aria-label={t('smartTrack.enabled')}");
    expect(smartTrack).toContain('checked={config?.enabled ?? true}');
    expect(smartTrack).toContain("aria-label={t('smartTrack.autoScan')}");
    expect(smartTrack).toContain('checked={config?.auto_scan ?? true}');
    expect(smartTrack).toContain('savedConfigRef.current = saved;');
    expect(smartTrack).toContain('setConfig(saved);');
    expect(smartTrack).toContain('setConfig(savedConfigRef.current || config);');
    expect(smartTrack).not.toContain('Spart bis zu 90 %');
    expect(smartTrack).toContain("{t('smartTrack.autoScanNote')}");
    expect(smartTrack).not.toContain('benötigt noch Backend-Unterstützung');
  });
});
