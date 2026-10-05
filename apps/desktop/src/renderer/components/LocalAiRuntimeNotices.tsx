import React from 'react';
import { useDesktopI18n } from '../i18n.js';
import type { LocalAiRuntimeSetupManifest } from '../local-ai-runtime-contracts.js';
import { localAiCopy } from '../i18n/local-ai-copy.js';
import { localAiRuntimeReason } from '../i18n/local-ai-runtime-copy.js';
import { localAiRuntimeNoticeCopy } from '../i18n/local-ai-runtime-notice-copy.js';
export function LocalAiRuntimeNotices({manifest}:Readonly<{manifest:LocalAiRuntimeSetupManifest}>):React.JSX.Element{
 const {locale}=useDesktopI18n(),copy=localAiRuntimeNoticeCopy(locale),base=localAiCopy(locale),summary=manifest.noticeSummary;
 return <details className="local-ai-runtime-notices" data-local-ai-runtime-notices><summary>{copy.title}</summary><code>{manifest.runtimeBuildRef}</code>
  <p>{copy.limits}</p>{summary?<><p>{copy.sourceBundle}: {summary.sourceBundleVerified?base.verified:base.unknown} · {summary.verifiedPayloadCount}</p>
   {summary.components.map(component=><article key={component.noticeId}><strong>{component.name}</strong><p>{component.licenseLabel}</p>
    {component.noticeText!==undefined&&<details><summary>{component.name} — {component.licenseLabel}</summary>
     <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:'24rem',overflow:'auto'}}>{component.noticeText}</pre></details>}
    {component.sourceUrl&&<button type="button" onClick={()=>void window.lastbrowser.system.openExternal(component.sourceUrl!)}>{copy.source}</button>}</article>)}</>
   :<p>{localAiRuntimeReason(locale,manifest.reasonCode)}</p>}
 </details>;
}
