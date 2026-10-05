import { sameAssistantScope, type CapabilityCatalog, type IndependentResult, type IndependentScope, type ResolvedAssistantScope } from './independent-contracts.js';

export type PluginBrowserContext = Readonly<{
  selection: ResolvedAssistantScope | null;
  selectionRevision: number;
  activeBrowserProfileId: string;
  activeWorkspacePath: string | null;
  activeBackendProfileName: string | null;
  selectionPathMatchesActive: boolean;
  requestScope: Readonly<{ profile: string; workspacePath: string | null; backendProfileName?: string }> | null;
}>;

export function isSafePluginStartUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 2048 || value !== value.trim()
    || /[\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    const authority = value.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i)?.[1] ?? '';
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || authority.includes('@') || url.username || url.password) return false;
    const secretKey = /^(auth|key)$/i;
    const secretPattern = /(token|secret|password|passwd|credential|authorization)/i;
    for (const part of [url.searchParams, new URLSearchParams(url.hash.replace(/^#/, ''))]) {
      for (const [rawKey, item] of part) {
        const key = rawKey.trim().toLowerCase().replace(/-/g, '_');
        if ((secretKey.test(key) || secretPattern.test(key) || key.endsWith('_key')) && item) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function currentSelectionMatches(scope: IndependentScope, context: PluginBrowserContext): boolean {
  const selection = context.selection;
  const request = context.requestScope;
  return Boolean(selection && request
    && sameAssistantScope(selection.scope, scope)
    && context.activeBrowserProfileId === scope.browserProfileId
    && (selection.backendProfileName ?? null) === context.activeBackendProfileName
    && context.selectionPathMatchesActive
    && request.profile === context.activeBrowserProfileId
    && request.workspacePath === context.activeWorkspacePath);
}

function sameSelection(left: PluginBrowserContext, right: PluginBrowserContext): boolean {
  return left.selectionRevision === right.selectionRevision
    && left.selection?.bindingRevision === right.selection?.bindingRevision
    && left.selection?.workspacePath === right.selection?.workspacePath
    && left.selection?.backendProfileName === right.selection?.backendProfileName
    && left.activeBrowserProfileId === right.activeBrowserProfileId
    && left.activeWorkspacePath === right.activeWorkspacePath
    && left.activeBackendProfileName === right.activeBackendProfileName
    && left.requestScope?.profile === right.requestScope?.profile
    && left.requestScope?.workspacePath === right.requestScope?.workspacePath
    && (left.requestScope?.backendProfileName ?? null) === (right.requestScope?.backendProfileName ?? null);
}

export async function openPluginBrowserCapability(options: {
  scope: IndependentScope;
  capabilityId: string;
  startUrl: string;
  getContext: () => PluginBrowserContext;
  refreshCatalog: (scope: IndependentScope) => Promise<IndependentResult<CapabilityCatalog>>;
  openTab: (url: string) => void;
}): Promise<boolean> {
  const { scope, capabilityId, startUrl, getContext, refreshCatalog, openTab } = options;
  if (!capabilityId.startsWith('plugin:') || !isSafePluginStartUrl(startUrl)) return false;
  const before = getContext();
  if (!currentSelectionMatches(scope, before)) return false;
  let result: IndependentResult<CapabilityCatalog>;
  try {
    result = await refreshCatalog(scope);
  } catch {
    return false;
  }
  if (!result.ok) return false;
  const after = getContext();
  if (!sameSelection(before, after) || !currentSelectionMatches(scope, after)
    || !sameAssistantScope(result.value.scope, scope)) return false;
  const entry = result.value.entries.find(row => row.capabilityId === capabilityId);
  if (!entry || entry.connectionKind !== 'connector' || entry.status !== 'restricted'
    || entry.supportedTasks.length !== 0 || entry.startUrl !== startUrl
    || !entry.connections?.length || entry.connections.some(connection => connection.adapterAvailable)) return false;
  try {
    openTab(startUrl);
    return true;
  } catch {
    return false;
  }
}
