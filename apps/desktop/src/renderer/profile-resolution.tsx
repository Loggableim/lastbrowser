import React, { createContext, useContext } from 'react';
export const ProfileResolutionContext = createContext<{ error: string; retry: () => void }>({ error: '', retry: () => {} });
export function ProfileResolutionPending() {
  const { error, retry } = useContext(ProfileResolutionContext);
  const de = typeof document !== 'undefined' && document.documentElement.lang.startsWith('de');
  return <section className="browser-main native-rest-main" aria-live="polite">
    <p role={error ? 'alert' : 'status'}>{error || (de ? 'KI-Profil wird aufgelöst …' : 'Resolving AI profile …')}</p>
    {error && <button type="button" onClick={retry}>{de ? 'Erneut versuchen' : 'Retry'}</button>}
  </section>;
}
