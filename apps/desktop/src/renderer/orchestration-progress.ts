export type OrchestrationProgress = {
  mode: 'teamwork' | 'smart-track';
  message: string;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function label(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 100)
    : fallback;
}

/** Convert orchestration SSE events into safe, concise progress shown in the pending chat bubble. */
export function describeOrchestrationProgress(event: string, payload: unknown): OrchestrationProgress | null {
  const data = record(payload);

  switch (event) {
    case 'teamwork_stage': {
      const stage = label(data.stage, 'debate');
      const fallback: Record<string, string> = {
        grounding: 'erfasst den gemeinsamen Kontext',
        planning: 'erstellt einen Arbeitsplan',
        debate: 'generiert parallele Entwürfe',
        critic: 'prüft die Entwürfe',
        synthesizing: 'führt die Ergebnisse zusammen',
      };
      const detail = label(data.message, fallback[stage] || 'arbeitet');
      return { mode: 'teamwork', message: `Teamwork: ${detail}` };
    }
    case 'teamwork_plan':
      return { mode: 'teamwork', message: `Teamwork: Arbeitsplan von ${label(data.model, 'Planer')} erstellt.` };
    case 'teamwork_draft': {
      const name = label(data.name || data.model, 'Worker');
      return {
        mode: 'teamwork',
        message: data.error
          ? `Teamwork: ${name} hat keinen nutzbaren Entwurf geliefert.`
          : `Teamwork: Entwurf von ${name} eingetroffen.`,
      };
    }
    case 'teamwork_critic':
      return { mode: 'teamwork', message: `Teamwork: Review von ${label(data.model, 'Critic')} abgeschlossen.` };
    case 'teamwork_complete':
      return { mode: 'teamwork', message: 'Teamwork: Synthese abgeschlossen.' };
    case 'smart_track_routed': {
      const effort = label(data.effort, 'medium').toUpperCase();
      const model = label(data.name || data.model, 'Modell');
      return { mode: 'smart-track', message: `Smart Track ${effort}: ${model} ausgewählt.` };
    }
    case 'smart_track_step': {
      const stage = label(data.stage, 'executing');
      const fallback = stage === 'preplan' ? 'Vorplanung läuft.' : 'Antwort wird erstellt.';
      return { mode: 'smart-track', message: `Smart Track: ${label(data.message, fallback)}` };
    }
    case 'smart_track_preplan':
      return { mode: 'smart-track', message: 'Smart Track: Vorplanung abgeschlossen; Ausführung startet.' };
    case 'smart_track_complete':
      return { mode: 'smart-track', message: 'Smart Track: Antwort abgeschlossen.' };
    default:
      return null;
  }
}
