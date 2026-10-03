export const startupUpdateNoticeKey = 'lastbrowser.updates.hideStartupNotice';

export function shouldShowStartupUpdateNotice(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(startupUpdateNoticeKey) !== 'true';
  } catch {
    return true;
  }
}

export function setStartupUpdateNoticeHidden(storage: Pick<Storage, 'setItem'>, hidden: boolean): boolean {
  try {
    storage.setItem(startupUpdateNoticeKey, String(hidden));
    return true;
  } catch {
    return false;
  }
}
