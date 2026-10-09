import React from 'react';
import { useDesktopI18n } from '../i18n.js';
import { localAiCopy } from '../i18n/local-ai-copy.js';
import './local-ai-setup.css';

type Props=Readonly<{workspacePath:string;browserProfileId:string;backendProfileName?:string|null;ready:boolean;onSkipped?:()=>void;keepGlobalRouterStatusVisible?:boolean}>;

/** The reduced test candidate deliberately ships without bundled local inference. */
export function LocalAiSetupPane(_props:Props):React.JSX.Element{
  const {locale}=useDesktopI18n(),copy=localAiCopy(locale);
  return <section className="local-ai-setup" aria-label={copy.title} data-local-ai-status="unavailable">
    <h2>{copy.title}</h2>
    <p role="status">{copy.testBuildUnavailable}</p>
    <p>{copy.externalProvidersUnaffected}</p>
  </section>;
}
