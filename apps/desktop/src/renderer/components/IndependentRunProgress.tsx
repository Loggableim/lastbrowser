import { useDesktopI18n } from '../i18n.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import type { RunProgress } from '../independent-contracts.js';
const truncationCopy: Record<DesktopLocaleId,string> = {
  en:'The saved partial output is limited to 64,000 characters.',de:'Die gespeicherte Teilausgabe ist auf 64.000 Zeichen begrenzt.',
  es:'La salida parcial guardada se limita a 64.000 caracteres.',fr:'La sortie partielle enregistrée est limitée à 64 000 caractères.',
  it:'L’output parziale salvato è limitato a 64.000 caratteri.','pt-BR':'A saída parcial salva é limitada a 64.000 caracteres.',
  ru:'Сохранённый частичный вывод ограничен 64 000 символами.',ja:'保存される途中の出力は 64,000 文字までです。',
};
/** Genuine SDK output and counters from a backend snapshot. Runtime control
 * always uses the separate current RunView, not this observed progress state. */
export function IndependentRunProgress({ progress }: { progress:RunProgress }): React.JSX.Element {
  const { t,locale }=useDesktopI18n();
  return <section className="independent-run-progress" data-progress-run-id={progress.runId}>
    <time dateTime={progress.observedAt}>{new Date(progress.observedAt).toLocaleString(locale)}</time>
    <dl><dt>{t('spaceAssistant.toolBudget')}</dt><dd>{progress.counters.toolCalls}/{progress.budget.maxToolCalls}</dd>
      <dt>{t('spaceAssistant.requestBudget')}</dt><dd>{progress.counters.providerRequests}/{progress.budget.maxProviderRequests}</dd>
      <dt>{t('spaceAssistant.timeBudget')}</dt><dd>{Math.floor(progress.counters.activeSeconds)}/{progress.budget.maxActiveSeconds}</dd>
      <dt>{t('spaceAssistant.tokenBudget')}</dt><dd>{progress.counters.measuredTokens??'—'}/{progress.budget.maxMeasuredTokens}</dd></dl>
    {progress.text&&<><p className="space-assistant-prose" dir="auto">{progress.text.slice(-512)}</p>
      {progress.text.length>512&&<details><summary>{t('spaceAssistant.activity')}</summary><p className="space-assistant-prose" dir="auto">{progress.text}</p></details>}</>}
    {progress.textTruncated&&<p>{truncationCopy[locale]}</p>}
  </section>;
}
