class EventsEmitter {
  private events: Map<string, Function[]> = new Map();

  // Store pending commit messages per automation ID to avoid cross-user contamination
  // Key: automationId, Value: pending commit message
  private pendingCommitMessages: Map<string, string> = new Map();

  on(event: string, callback: Function) {
    this.events.set(event, [...(this.events.get(event) || []), callback]);

    return () => {
      this.events.set(event, this.events.get(event)?.filter((cb) => cb !== callback) || []);
    }
  }

  emit(event: string, ...args: any[]) {
    const callbacks = this.events.get(event) || [];
    callbacks.forEach((callback) => callback(...args));
  }

  // Set pending commit message for a specific automation
  setPendingCommitMessage(automationId: string, message: string): void {
    this.pendingCommitMessages.set(automationId, message);
  }

  // Get pending commit message for a specific automation
  getPendingCommitMessage(automationId: string): string | null {
    return this.pendingCommitMessages.get(automationId) || null;
  }

  // Clear pending commit message for a specific automation
  clearPendingCommitMessage(automationId: string): void {
    this.pendingCommitMessages.delete(automationId);
  }
}

export default new EventsEmitter();
