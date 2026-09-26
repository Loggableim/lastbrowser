/** A list response is stale once any newer pushed download snapshot arrives. */
export function canApplyDownloadSnapshot(requestRevision: number, currentRevision: number): boolean {
  return requestRevision === currentRevision;
}
