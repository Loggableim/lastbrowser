import React, { FormEvent, useMemo, useState } from 'react';
import { ExternalLink, Globe2, Loader2, Search, Sparkles } from 'lucide-react';
import { AiBrowserBrief, buildAiBrowserPrompt, parseAiBrowserResponse } from '../ai-browser.js';
import { brandAssets } from '../brand.js';
import { normalizeNavigationInput } from '../tabs.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;

const exampleQueries = [
  'best local AI model for Windows',
  'compare Arc Browser and Dia Browser',
  'latest Electron security checklist'
];

export function NativeAiBrowserMain({
  serviceStatus,
  onNavigate
}: {
  serviceStatus: ServiceStatus | null;
  onNavigate: (url: string) => void;
}): JSX.Element {
  const ready = serviceStatus?.sidekick === 'ready' && serviceStatus?.webuiHealth === 'ready';
  const [query, setQuery] = useState('');
  const [brief, setBrief] = useState<AiBrowserBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const statusLabel = ready ? 'Sidekick online' : 'Sidekick starting';
  const visibleResults = useMemo(() => brief?.results || [], [brief]);

  async function runSearch(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    if (!ready) {
      setError('Sidekick is still starting. You can open a normal web search now, or run AI Search once Sidekick is online.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await window.lastbrowser.sidekick.sendMessage({
        message: buildAiBrowserPrompt(cleanQuery),
        profile: 'default'
      });
      setBrief(parseAiBrowserResponse(response.assistantMessage, cleanQuery));
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setLoading(false);
    }
  }

  function openWebSearch(): void {
    const target = query.trim() || brief?.query || '';
    if (target) onNavigate(normalizeNavigationInput(target));
  }

  function runExample(value: string): void {
    setQuery(value);
  }

  return (
    <section className="browser-main ai-browser-main">
      <div className="ai-browser-hero">
        <div className="ai-browser-title">
          <img src={brandAssets.icon} alt="" />
          <div>
            <span className="eyebrow">AI Browser</span>
            <h1>Search briefing</h1>
          </div>
        </div>
        <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
          <span className={ready ? 'status-dot ready' : 'status-dot'} />
          <span>{statusLabel}</span>
        </div>
      </div>

      <form className="ai-search-box" onSubmit={(event) => void runSearch(event)}>
        <Search size={19} />
        <input
          value={query}
          placeholder="Ask Sidekick to research anything..."
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" className="primary-action compact" disabled={!query.trim() || loading}>
          {loading ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          <span>{loading ? 'Researching' : 'AI Search'}</span>
        </button>
        <button type="button" className="secondary-action compact" disabled={!query.trim()} onClick={openWebSearch}>
          <Globe2 size={16} />
          <span>Open web</span>
        </button>
      </form>

      <div className="ai-query-chips">
        {exampleQueries.map((item) => (
          <button key={item} type="button" onClick={() => runExample(item)}>{item}</button>
        ))}
      </div>

      {error && <div className="workspace-error">{error}</div>}

      {brief ? (
        <div className="ai-brief-layout">
          <section className="ai-summary-card">
            <span className="eyebrow">Summary</span>
            <h2>{brief.query}</h2>
            <p>{brief.summary}</p>
            {!!brief.keyPoints.length && (
              <div className="ai-keypoints">
                {brief.keyPoints.map((point) => <span key={point}>{point}</span>)}
              </div>
            )}
          </section>

          <section className="ai-results-grid">
            {visibleResults.map((result) => (
              <article key={`${result.title}-${result.url}`} className="ai-result-card">
                <div>
                  <strong>{result.title}</strong>
                  {result.source && <span>{result.source}</span>}
                </div>
                <p>{result.snippet || result.url}</p>
                {result.url && (
                  <button type="button" onClick={() => onNavigate(result.url)}>
                    <ExternalLink size={14} />
                    <span>Open</span>
                  </button>
                )}
              </article>
            ))}
          </section>

          {!!brief.nextSteps.length && (
            <section className="ai-next-steps">
              <span className="eyebrow">Next</span>
              {brief.nextSteps.map((step) => <button key={step} type="button" onClick={() => setQuery(step)}>{step}</button>)}
            </section>
          )}
        </div>
      ) : (
        <div className="ai-browser-empty">
          <img src={brandAssets.sidekickAvatar} alt="" />
          <h2>AI Browser</h2>
          <p>Sidekick turns a search into a compact brief with sources, key points and next steps.</p>
        </div>
      )}

      <AdvancedWebUiTools panel="browser" serviceStatus={serviceStatus} compact />
    </section>
  );
}
