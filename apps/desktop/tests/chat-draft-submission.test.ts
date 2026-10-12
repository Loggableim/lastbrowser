import { describe, expect, it } from 'vitest';
import { ChatDraftSubmissionGate, isDefiniteChatStartRejection } from '../src/renderer/chat-draft-submission.js';
import { hasCurrentTurnBrowserUse } from '../src/renderer/chat-browser-use.js';

describe('optimistic chat submission', () => {
  it('reserves synchronously and prevents repeated Enter before async start returns', () => {
    const gate = new ChatDraftSubmissionGate();
    const turn = gate.begin('  exact draft\n', 1, 'scope');
    expect(turn).not.toBeNull();
    expect(gate.begin('duplicate', 1, 'scope')).toBeNull();
    gate.finish(turn!);
    expect(gate.begin('next', 2, 'scope')).not.toBeNull();
  });
  it('restores an exact rejected draft only in the same untouched composer', () => {
    const gate = new ChatDraftSubmissionGate();
    const turn = gate.begin('  exact draft\n', 1, 'scope')!;
    expect(gate.restore(turn, 1, 'scope')).toBe('  exact draft\n');
    expect(gate.restore(turn, 2, 'scope')).toBeNull();
    expect(gate.restore(turn, 1, 'other-session')).toBeNull();
    turn.definitelyRejected = false;
    expect(gate.restore(turn, 1, 'scope')).toBeNull();
  });
  it('does not restore a draft the user explicitly stopped before acceptance', () => {
    const gate = new ChatDraftSubmissionGate();
    const turn = gate.begin('stopped draft', 1, 'scope')!;
    turn.stoppedBeforeAcceptance = true;
    expect(turn.definitelyRejected).toBe(true);
    expect(gate.restore(turn, 1, 'scope')).toBeNull();
  });
  it.each(['route handler did not start a response in time', 'HTTP 504 timeout', 'socket disconnected', 'unknown IPC failure'])(
    'does not make an ambiguous start sendable again: %s', error => {
      expect(isDefiniteChatStartRejection(new Error(error))).toBe(false);
    },
  );
  it.each(['HTTP 403 provider rejected request', 'model_inactive', 'scope_denied'])(
    'allows draft recovery for a definite rejection: %s', error => {
      expect(isDefiniteChatStartRejection(new Error(error))).toBe(true);
    },
  );
});

describe('browser controls belong to actual browser use', () => {
  it('ignores chat text, other tools, and browser calls from older turns', () => {
    expect(hasCurrentTurnBrowserUse([{role:'user',content:'hi'},{role:'assistant',content:'browser_navigate'}])).toBe(false);
    expect(hasCurrentTurnBrowserUse([{role:'assistant',content:'',tool_calls:[{name:'browser_navigate'}]},
      {role:'user',content:'hi'},{role:'assistant',content:'Hello',tool_calls:[{name:'read_file'}]}])).toBe(false);
  });
  it('accepts actual current-turn browser calls in both supported tool formats', () => {
    for (const call of [{name:'browser_navigate'},{function:{name:'browser_snapshot'}}]) {
      expect(hasCurrentTurnBrowserUse([{role:'user',content:'browse'}, {role:'assistant',content:'',tool_calls:[call]}])).toBe(true);
    }
  });
  it.each(['browser_action_v1', 'browser_cdp', 'browser_dialog', 'browser_scroll', 'browser_back',
    'browser_press', 'browser_get_images', 'browser_vision', 'browser_console', 'browser_type', 'browser_click',
    'independent_browser_navigate', 'independent_browser_read', 'independent_browser_screenshot',
    'independent_browser_click', 'independent_browser_type'])(
    'recognizes registered browser tool %s', name => {
      expect(hasCurrentTurnBrowserUse([{role:'assistant',content:'',tool_calls:[{function:{name}}]}])).toBe(true);
    },
  );
  it.each(['browser_invented', 'browser_action_v2', 'independent_browser_invented'])(
    'does not treat an unknown browser-like name as browser activity: %s', name => {
      expect(hasCurrentTurnBrowserUse([{role:'assistant',content:'',tool_calls:[{name}]}])).toBe(false);
    },
  );
});
