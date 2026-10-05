import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { isTrustedPreloadDocumentUrl } from './preload-origin.js';

/** Origin alone is insufficient: a guest can use the same URL as the shell. */
export function assertTrustedShellSender(
  event: Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  isShell: (contents: WebContents) => boolean
): WebContents {
  const { sender, senderFrame } = event;
  if (!sender || sender.isDestroyed() || !isShell(sender) || !senderFrame
    || senderFrame !== sender.mainFrame || senderFrame.isDestroyed()
    || !isTrustedPreloadDocumentUrl(senderFrame.url)
    || !isTrustedPreloadDocumentUrl(sender.getURL())) {
    throw new Error('Untrusted IPC sender');
  }
  return sender;
}

/** Recheck after an asynchronous lookup: navigation can invalidate an earlier check. */
export function captureTrustedShellSender(
  event: Pick<IpcMainEvent | IpcMainInvokeEvent, 'sender' | 'senderFrame'>,
  isShell: (contents: WebContents) => boolean
): () => WebContents {
  const sender = assertTrustedShellSender(event, isShell);
  const frame = event.senderFrame;
  return () => {
    const current = assertTrustedShellSender(event, isShell);
    if (current !== sender || current.mainFrame !== frame) throw new Error('IPC sender navigated');
    return current;
  };
}
