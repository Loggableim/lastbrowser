import { canReleaseAccessGateFromStartupPreflight, type AccessAuthStatus } from './access-auth.js';

export type AccessAuthGateSnapshot = {
  checked: boolean;
  required: boolean;
  error: string;
};

export type AccessAuthGateAction =
  | { type: 'lock' }
  | { type: 'scope-change'; scopeId: string }
  | { type: 'preflight'; generation: number; scopeId: string; policy: 'disabled' | 'enabled' | 'unknown' }
  | { type: 'status'; generation: number; auth: AccessAuthStatus }
  | { type: 'status-error'; generation: number; error: string }
  | { type: 'login-success'; generation: number }
  | { type: 'retry' };

export type AccessAuthGateState = AccessAuthGateSnapshot & {
  generation: number;
  scopeId: string | null;
};

export const initialAccessAuthGateState: AccessAuthGateState = {
  checked: false,
  required: false,
  error: '',
  generation: 0,
  scopeId: null
};

/** Applies auth results only while their captured generation and scope remain current. */
export function reduceAccessAuthGate(
  state: AccessAuthGateState,
  action: AccessAuthGateAction
): AccessAuthGateState {
  switch (action.type) {
    case 'lock':
      return { ...state, generation: state.generation + 1, checked: true, required: true, error: '' };
    case 'retry':
      return { ...state, generation: state.generation + 1, checked: false, error: '' };
    case 'scope-change':
      if (state.scopeId === action.scopeId) return state;
      return {
        ...state,
        generation: state.generation + 1,
        scopeId: action.scopeId,
        checked: false,
        required: true,
        error: ''
      };
    case 'preflight':
      if (action.generation !== state.generation) return state;
      if (!action.scopeId || (state.scopeId && state.scopeId !== action.scopeId)) return state;
      if (state.scopeId === null) state = { ...state, scopeId: action.scopeId };
      if (!canReleaseAccessGateFromStartupPreflight(action.policy)) return state;
      return { ...state, checked: true, required: false, error: '' };
    case 'status':
      if (action.generation !== state.generation) return state;
      return {
        ...state,
        checked: true,
        required: action.auth.auth_enabled === false
          ? false
          : action.auth.auth_enabled === true && action.auth.logged_in === true
            ? false
            : true,
        error: ''
      };
    case 'status-error':
      if (action.generation !== state.generation) return state;
      return { ...state, checked: false, error: action.error };
    case 'login-success':
      if (action.generation !== state.generation) return state;
      return { ...state, checked: true, required: false, error: '' };
  }
}

/** Small stateful consumer used by App and regression tests for event ordering. */
export function createAccessAuthGateConsumer(initialState = initialAccessAuthGateState) {
  let state = initialState;
  return {
    get state(): AccessAuthGateState {
      return state;
    },
    dispatch(action: AccessAuthGateAction): AccessAuthGateState {
      state = reduceAccessAuthGate(state, action);
      return state;
    }
  };
}
