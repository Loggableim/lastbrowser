type ChatUiOwner = {
  sessionId: string | null;
  streamId: string | null;
};

/** Tracks local stream work independently from which Space currently owns the chat UI. */
export class ChatUiOwnership {
  private nextOwnerId = 0;
  private activeOwnerId: number | null = null;
  private readonly owners = new Map<number, ChatUiOwner>();
  private readonly streamOwners = new Map<string, number>();

  begin(sessionId?: string | null): number {
    const ownerId = ++this.nextOwnerId;
    this.owners.set(ownerId, { sessionId: sessionId || null, streamId: null });
    this.activeOwnerId = ownerId;
    return ownerId;
  }

  bindSession(ownerId: number, sessionId: string): void {
    const owner = this.owners.get(ownerId);
    if (!owner) return;
    owner.sessionId = sessionId;
  }

  registerStream(ownerId: number, streamId: string, sessionId: string): void {
    const owner = this.owners.get(ownerId);
    if (!owner) return;
    owner.sessionId = sessionId;
    owner.streamId = streamId;
    this.streamOwners.set(streamId, ownerId);
  }

  ownerForStream(streamId: string): number | null {
    const ownerId = this.streamOwners.get(streamId);
    return ownerId !== undefined && this.owners.has(ownerId) ? ownerId : null;
  }

  reactivate(ownerId: number, sessionId: string): boolean {
    const owner = this.owners.get(ownerId);
    if (!owner || owner.sessionId !== sessionId) return false;
    this.activeOwnerId = ownerId;
    return true;
  }

  isLocalTurn(sessionId: string): boolean {
    return [...this.owners.values()].some((owner) => owner.sessionId === sessionId);
  }

  finish(ownerId: number): boolean {
    const owner = this.owners.get(ownerId);
    if (!owner) return false;
    this.owners.delete(ownerId);
    if (owner.streamId && this.streamOwners.get(owner.streamId) === ownerId) {
      this.streamOwners.delete(owner.streamId);
    }
    const wasActive = this.activeOwnerId === ownerId;
    if (wasActive) this.activeOwnerId = null;
    return wasActive;
  }

  releaseUiOwner(): void {
    this.activeOwnerId = null;
  }

  get activeSessionId(): string | null {
    return this.activeOwnerId === null ? null : this.owners.get(this.activeOwnerId)?.sessionId ?? null;
  }
}
