#!/usr/bin/env node
/**
 * Narrow live feature probe. Reuses the existing actual Main/App/backend entry
 * probe without editing it; captures a metadata-only view of its own disposable
 * test session immediately before that probe removes the isolated userData.
 *
 * Usage: node scripts/probe-chat-feature-runtime.cjs [feature-preview-dir]
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const preview = fs.realpathSync(path.resolve(process.argv[2] ||
  'output/feature-preview-2026-10-04T18-49-45-775Z-45c99ab2'));
const outputs = path.join(root, 'output');
const previewRoot = fs.realpathSync(outputs);
const prefix = previewRoot + path.sep;
if (!preview.startsWith(prefix)) throw Error('Preview must remain under this repository output directory');
const receipt = JSON.parse(fs.readFileSync(path.join(preview, 'preview-result.json'), 'utf8'));
if (receipt.unsigned !== true || receipt.published !== false || receipt.error || receipt.resourceFiles < 1)
  throw Error('Expected an existing unsigned unpublished feature preview');
const fullAppProbe = path.join(root, 'scripts', 'probe-full-app-entry.cjs');
const runId = randomUUID();
const reportPath = path.join(outputs, 'chat-feature-runtime-' + runId + '.json');
const reportsBefore = new Set(fs.readdirSync(outputs).filter(name => /^full-app-entry-.*\.json$/.test(name)));
const originalRmSync = fs.rmSync;
let capture = null;

function summarize(value) {
  if (!value || typeof value !== 'object') return null;
  const messages = Array.isArray(value.messages) ? value.messages : [];
  return {
    sessionId: value.session_id || value.sessionId || null,
    scope: value.space_scope || value.spaceScope || null,
    selectedModel: value.model || null,
    selectedProvider: value.model_provider || value.modelProvider || null,
    chatMode: value.chat_mode || value.chatMode || null,
    messageCount: messages.length,
    assistantTurns: messages.filter(message => message?.role === 'assistant').map(message => {
      const evidence = message.provider_evidence || message.execution_evidence || null;
      return {
        turnId: message.turn_id || message.turnId || null,
        streamId: message.stream_id || message.streamId || null,
        hasContent: typeof message.content === 'string' && message.content.length > 0,
        providerEvidence: evidence && typeof evidence === 'object' ? {
          providerId: evidence.provider_id || null,
          modelId: evidence.model_id || null,
          successfulChat: evidence.successful_chat === true,
        } : null,
      };
    }),
    persistentGoalStatePresent: Boolean(value.goal_state || value.persistent_goal || value.goal),
  };
}

function captureBeforeCleanup(target) {
  const absolute = path.resolve(target);
  const tempPrefix = path.resolve(os.tmpdir()) + path.sep;
  if (!absolute.startsWith(tempPrefix) || !path.basename(absolute).startsWith('lastbrowser-full-app-')) return;
  const childReport = path.join(absolute, 'child-report.json');
  if (!fs.existsSync(childReport)) return;
  const actual = JSON.parse(fs.readFileSync(childReport, 'utf8'));
  const userData = path.resolve(actual.writableRoots?.electronUserData || '');
  if (!userData.startsWith(absolute + path.sep) || !fs.existsSync(userData)) return;
  const native = actual.nativeStarted || null;
  let persistedNativeSession = null;
  if (native?.sessionId && Array.isArray(actual.sessionFiles)) {
    for (const name of actual.sessionFiles) {
      const candidate = path.resolve(userData, name);
      if (!candidate.startsWith(userData + path.sep) || path.basename(candidate) !== native.sessionId + '.json') continue;
      if (!fs.existsSync(candidate)) continue;
      persistedNativeSession = summarize(JSON.parse(fs.readFileSync(candidate, 'utf8')));
      break;
    }
  }
  const phases = Array.isArray(actual.delegatedPanel) ? actual.delegatedPanel :
    Array.isArray(actual.phases) ? actual.phases : [];
  const report = {
    schemaVersion: 1,
    runId,
    preview: { unsigned: receipt.unsigned, published: receipt.published, resourceFiles: receipt.resourceFiles },
    source: {
      mainSha256: hash(path.join(root, 'apps/desktop/src/main/main.ts')),
      appSha256: hash(path.join(root, 'apps/desktop/src/renderer/App.tsx')),
      nativeChatApiSha256: hash(path.join(root, 'services/sidekick/web/api/native_chats.py')),
    },
    fullAppProbe: {
      passed: actual.passed === true,
      shellReloads: actual.shellReloads || 0,
      nativeStarted: native && { sessionId: native.sessionId, streamId: native.streamId, scope: native.scope },
      nativeTerminalDiagnostics: actual.nativeTerminalDiagnostics || [],
      sessionFileFoundBeforeCleanup: persistedNativeSession !== null,
      persistedNativeSession,
      originalDelegatedWork: actual.delegatedPanel || null,
      delegatedStorage: actual.delegationStorage || null,
      subagentEventsObserved: Array.isArray(actual.childHistory) ? actual.childHistory.length : null,
    },
    findings: [],
    limits: [
      'The existing full-app probe uses a controlled localhost provider and its own disposable userData.',
      'It does not create a persistent /goal or AUTO turn; absence of those observations is not a product failure claim.',
      'No real user profile, account, external provider, or published/signed app is used.',
    ],
    completedAt: new Date().toISOString(),
  };
  const assistantTurns = persistedNativeSession?.assistantTurns || [];
  const matching = assistantTurns.filter(turn => turn.streamId === native?.streamId);
  report.findings.push({
    check: 'native_assistant_message_and_provider_evidence_survives_reload',
    result: persistedNativeSession && matching.some(turn => turn.providerEvidence?.successfulChat === true)
      ? 'observed' : 'not_proven',
    matchingAssistantTurnCount: matching.length,
  });
  report.findings.push({
    check: 'auto_provider_evidence_survives_reload',
    result: matching.some(turn => turn.providerEvidence?.providerId === 'custom:full-app')
      ? 'not_exercised_controlled_fixed_provider_only' : 'not_proven',
  });
  report.findings.push({
    check: 'persistent_goal_survives_reload',
    result: persistedNativeSession?.persistentGoalStatePresent ? 'observed' : 'not_exercised_by_existing_full_app_probe',
  });
  report.findings.push({
    check: 'subagent_backend_execution_events',
    result: actual.delegatedPanel?.originalAnswerSaved && actual.delegatedPanel?.readerReloadSurvived
      ? 'delegated_result_and_reload_observed_event_log_not_exported' : 'not_proven',
  });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' });
  capture = report;
}

function hash(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

fs.rmSync = function (target, options) {
  try { captureBeforeCleanup(target); } catch (error) {
    if (!capture) capture = { captureError: String(error?.message || error).slice(0, 240) };
  }
  return originalRmSync.call(this, target, options);
};

// Exercise the existing real Electron Main/App + packaged sidecar/Python entry.
// Its own temp userData and networking guards remain in force.
process.argv = [process.execPath, fullAppProbe, '--preview', preview, '--browser', '--delegation'];
require(fullAppProbe);
process.on('exit', () => {
  if (!capture) {
    const created = fs.readdirSync(outputs).filter(name => /^full-app-entry-.*\.json$/.test(name) && !reportsBefore.has(name));
    const latest = created.map(name => path.join(outputs,name)).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0];
    let underlying = null;
    try { underlying = latest ? JSON.parse(fs.readFileSync(latest,'utf8')) : null; } catch {}
    const report = { schemaVersion: 1, runId,
      preview: { unsigned: true, published: false, resourceFiles: receipt.resourceFiles },
      result: underlying?.childExit?.code === 0 ? 'probe_finished_without_session_capture' : 'blocked_before_native_chat',
      probe: underlying ? { childExit:underlying.childExit, timedOut:underlying.timedOut,
        packagedAsarSha256:underlying.packagedAsarSha256, phases:underlying.phases?.map(row=>row.phase)||[],
        ownedUserDataCleanup:underlying.cleanup, sourceMainSha256:underlying.sourceMain,
        sourceAppSha256:underlying.sourceApp } : null,
      limits: ['No owned child-report was available before cleanup; no NativeRunner, goal, or AUTO turn is claimed.'],
      completedAt: new Date().toISOString() };
    try { fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' }); } catch {}
  }
  process.stdout.write('[chat-feature-probe] ' + reportPath + '\n');
});
