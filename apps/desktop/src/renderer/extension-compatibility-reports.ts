export type ExtensionUserReport = { works: boolean; reportedAt: number };

function key(profileId: string, extensionId: string, version: string): string {
  if (!profileId || !/^[a-p]{32}$/.test(extensionId) || !version.trim()) throw Error('report_scope_unavailable');
  return `lastbrowser:extension-user-report:v1:${JSON.stringify([profileId, extensionId, version])}`;
}

/** Personal reports only. No requests, uploads, community scores or runtime qualification. */
export function readExtensionUserReport(profileId: string, extensionId: string, version: string): ExtensionUserReport | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(profileId, extensionId, version)) || 'null');
    if (!value || typeof value !== 'object') return null;
    const report = value as Record<string, unknown>;
    return typeof report.works === 'boolean' && typeof report.reportedAt === 'number' && Number.isFinite(report.reportedAt)
      ? { works: report.works, reportedAt: report.reportedAt } : null;
  } catch { return null; }
}

export function saveExtensionUserReport(profileId: string, extensionId: string, version: string, works: boolean | null): void {
  const storageKey = key(profileId, extensionId, version);
  if (works === null) localStorage.removeItem(storageKey);
  else localStorage.setItem(storageKey, JSON.stringify({ works, reportedAt: Date.now() }));
}
