/** Native chat browser ownership is a real writer, never a manufactured run. */
export type NativeBrowserOwner = Readonly<{ ownerKind: 'native_chat'; sessionId: string; streamId: string;
  writerGeneration: string; writerLeaseId: string }>;
export type BrowserOwnerFields = Readonly<{ runId: string | null; ownerKind?: 'native_chat';
  sessionId?: string; streamId?: string; writerGeneration?: string; writerLeaseId?: string }>;
export const browserOwnerKeys = ['ownerKind', 'sessionId', 'streamId', 'writerGeneration', 'writerLeaseId'] as const;
export function isNativeBrowserOwner(value: BrowserOwnerFields): value is BrowserOwnerFields & NativeBrowserOwner {
  return value.runId === null && value.ownerKind === 'native_chat'
    && [value.sessionId, value.streamId].every(item => typeof item === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(item))
    && [value.writerGeneration, value.writerLeaseId].every(item => typeof item === 'string' && !!item
      && item.length <= 128 && item === item.trim() && !/[\x00-\x1f]/.test(item));
}
export function validBrowserOwner(value: BrowserOwnerFields): boolean {
  return isNativeBrowserOwner(value) || typeof value.runId === 'string' && !!value.runId && value.runId.length <= 256
    && browserOwnerKeys.every(key => value[key] === undefined);
}
export function sameBrowserOwner(left: BrowserOwnerFields, right: BrowserOwnerFields): boolean {
  return validBrowserOwner(left) && validBrowserOwner(right) && left.runId === right.runId
    && browserOwnerKeys.every(key => left[key] === right[key]);
}
export function browserOwnerFields(value: BrowserOwnerFields): BrowserOwnerFields {
  return isNativeBrowserOwner(value) ? { runId: null, ownerKind: 'native_chat', sessionId: value.sessionId,
    streamId: value.streamId, writerGeneration: value.writerGeneration, writerLeaseId: value.writerLeaseId } : { runId: value.runId };
}
