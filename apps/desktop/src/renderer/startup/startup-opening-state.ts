export type StartupOpeningState = 'idle' | 'pending' | 'opening';

export type StartupOpeningAction =
  | { type: 'verified-password-login'; passwordProtected: boolean }
  | { type: 'readiness'; authAllowed: boolean; ready: boolean; reducedMotion: boolean }
  | { type: 'lock' | 'scope-change' | 'complete' };

/** Keeps the startup overlay until a verified password login and browser readiness agree. */
export function reduceStartupOpeningState(
  state: StartupOpeningState,
  action: StartupOpeningAction
): StartupOpeningState {
  switch (action.type) {
    case 'verified-password-login':
      return action.passwordProtected ? 'pending' : 'idle';
    case 'readiness':
      if (!action.authAllowed) return 'idle';
      if (state === 'pending' && action.ready) return action.reducedMotion ? 'idle' : 'opening';
      if (state === 'opening' && !action.ready) return 'idle';
      return state;
    case 'lock':
    case 'scope-change':
    case 'complete':
      return 'idle';
  }
}
