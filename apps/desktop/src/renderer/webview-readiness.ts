/** WebViews are only safe to query after Electron has emitted `dom-ready`. */
const readyViews = new WeakSet<EventTarget>();

export interface WebviewLifecycleEvents extends EventTarget {}

export function isWebviewReady(view: EventTarget | null | undefined): boolean {
  return Boolean(view && readyViews.has(view));
}

/**
 * Track readiness for one concrete mounted element. Navigation start revokes
 * readiness until the next document is ready; stale events from a replaced
 * element are ignored by the identity predicate.
 */
export function bindWebviewReadiness(
  view: WebviewLifecycleEvents,
  isCurrent: () => boolean,
  onReadyChange?: (ready: boolean) => void
): () => void {
  readyViews.delete(view);
  onReadyChange?.(false);

  const onStartLoading = (): void => {
    if (!isCurrent()) return;
    readyViews.delete(view);
    onReadyChange?.(false);
  };
  const onDomReady = (): void => {
    if (!isCurrent()) return;
    readyViews.add(view);
    onReadyChange?.(true);
  };

  view.addEventListener('did-start-loading', onStartLoading);
  view.addEventListener('dom-ready', onDomReady);

  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    view.removeEventListener('did-start-loading', onStartLoading);
    view.removeEventListener('dom-ready', onDomReady);
    readyViews.delete(view);
    if (isCurrent()) onReadyChange?.(false);
  };
}
