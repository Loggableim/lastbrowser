/** A pending follow-up replaces the old stream binding only after start ACK. */
export async function resolveQuickChatStopTarget<T>(current: T | null, pending: Promise<T> | null): Promise<T | null> {
  return pending ? await pending : current;
}
