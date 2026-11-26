import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(path.resolve(process.cwd(), '../../services/sidekick/web/static/messages.js'), 'utf8');
const start = source.indexOf('async function respondApproval(choice) {');
const end = source.indexOf('\nfunction hideApprovalCard(', start);
if (start < 0 || end < 0) throw new Error('Approval response handler not found');

function createHarness(api: (...args: unknown[]) => Promise<unknown>) {
  const button = { disabled: false, classList: { remove: vi.fn(), add: vi.fn() } };
  const state = { status: 'pending', choice: null, element: {
    querySelectorAll: () => [button], querySelector: () => null,
  } };
  const context = vm.createContext({
    _inlineApprovalState: state, _approvalSessionId: 'session', _approvalCurrentId: 'first',
    S: {}, api, JSON, _clearApprovalTimeoutTimer: vi.fn(), _clearApprovalPendingForSession: vi.fn(),
    _updateInlineApprovalUI: vi.fn(), setStatus: vi.fn(), t: () => 'Error',
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, state, button, respond: context.respondApproval as (choice: string) => Promise<void> };
}

describe('web approval responses', () => {
  it('keeps an unsuccessful request pending and re-enables its controls', async () => {
    const harness = createHarness(async () => { throw new Error('stale request'); });
    await harness.respond('once');
    expect(harness.state.status).toBe('pending');
    expect(harness.button.disabled).toBe(false);
    expect(harness.context._clearApprovalPendingForSession).not.toHaveBeenCalled();
    expect(harness.context.setStatus).toHaveBeenCalled();
  });

  it('does not resolve a newer approval when an older response arrives', async () => {
    let finish: () => void = () => {};
    const harness = createHarness(() => new Promise<void>(resolve => { finish = resolve; }));
    const response = harness.respond('once');
    harness.context._approvalCurrentId = 'second';
    finish();
    await response;
    expect(harness.state.status).toBe('pending');
    expect(harness.context._approvalCurrentId).toBe('second');
    expect(harness.context._clearApprovalPendingForSession).not.toHaveBeenCalled();
  });
});
