import { describe, expect, it } from 'vitest';
import {
  acknowledgeUpdateNotice,
  decideUpdateNotice,
  emptyUpdateNoticeState,
  recordDownloadedUpdate
} from '../src/main/update-notice-state.js';

describe('update notice state', () => {
  it('sets a fresh-install baseline without presenting an upgrade', () => {
    const decision = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.46');
    expect(decision.candidate).toBeNull();
    expect(decision.state.lastSuccessfulVersion).toBe('0.1.46');
  });

  it('uses an updater receipt to recognize an upgrade when older versions had no marker', () => {
    const downloaded = recordDownloadedUpdate(emptyUpdateNoticeState(), '0.1.45', '0.1.46');
    expect(decideUpdateNotice(downloaded, '0.1.46').candidate).toEqual({ fromVersion: '0.1.45', toVersion: '0.1.46' });
  });

  it('recognizes a later manual installer upgrade from the last successful launch', () => {
    const first = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.45');
    expect(decideUpdateNotice(first.state, '0.1.46').candidate).toEqual({ fromVersion: '0.1.45', toVersion: '0.1.46' });
  });

  it('uses the installer update signal when there is no stored prior version', () => {
    const decision = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.46', true);
    expect(decision.candidate).toEqual({ fromVersion: null, toVersion: '0.1.46' });
    const ack = acknowledgeUpdateNotice(decision.state, '0.1.46', '0.1.46', true);
    expect(ack?.seenVersion).toBe('0.1.46');
    expect(decideUpdateNotice(ack!, '0.1.46', true).candidate).toBeNull();
  });

  it('shows the installed version once and records the acknowledgement', () => {
    const baseline = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.45').state;
    const ack = acknowledgeUpdateNotice(baseline, '0.1.46', '0.1.46');
    expect(ack).toMatchObject({ lastSuccessfulVersion: '0.1.46', seenVersion: '0.1.46' });
    expect(decideUpdateNotice(ack!, '0.1.46').candidate).toBeNull();
  });

  it('rejects stale acknowledgement and rebases a downgrade without showing an update', () => {
    const baseline = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.46').state;
    expect(acknowledgeUpdateNotice(baseline, '0.1.46', '0.1.45')).toBeNull();
    const downgrade = decideUpdateNotice(baseline, '0.1.45');
    expect(downgrade.candidate).toBeNull();
    expect(downgrade.state.lastSuccessfulVersion).toBe('0.1.45');
  });

  it('carries the previous successful version across skipped releases', () => {
    const baseline = decideUpdateNotice(emptyUpdateNoticeState(), '0.1.42').state;
    expect(decideUpdateNotice(baseline, '0.1.46').candidate).toEqual({ fromVersion: '0.1.42', toVersion: '0.1.46' });
  });

  it('ignores malformed version strings rather than inferring an update', () => {
    const baseline = decideUpdateNotice(emptyUpdateNoticeState(), 'local-build').state;
    expect(decideUpdateNotice(baseline, '0.1.46').candidate).toBeNull();
  });
});
