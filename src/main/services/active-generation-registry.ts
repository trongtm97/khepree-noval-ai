/**
 * Concurrent in-flight Gemini generations for multi-worker scheduler.
 * Cancel / finally must be keyed by correlationId — never process-wide.
 */

export interface ActiveGeneration {
  correlationId: string;
  accountId: string;
  cancel: () => Promise<void>;
  startedAt: number;
}

export class ActiveGenerationRegistry {
  private readonly byCorrelation = new Map<string, ActiveGeneration>();
  private readonly byAccount = new Map<string, Set<string>>();

  register(gen: ActiveGeneration): void {
    // Replace same correlation (resume) without orphaning account index.
    this.unregister(gen.correlationId);
    this.byCorrelation.set(gen.correlationId, gen);
    let set = this.byAccount.get(gen.accountId);
    if (!set) {
      set = new Set();
      this.byAccount.set(gen.accountId, set);
    }
    set.add(gen.correlationId);
  }

  /**
   * Remove one generation. Safe when A finishes while B is still active —
   * only A's entry is deleted.
   */
  unregister(correlationId: string): ActiveGeneration | null {
    const gen = this.byCorrelation.get(correlationId);
    if (!gen) return null;
    this.byCorrelation.delete(correlationId);
    const set = this.byAccount.get(gen.accountId);
    if (set) {
      set.delete(correlationId);
      if (set.size === 0) this.byAccount.delete(gen.accountId);
    }
    return gen;
  }

  get(correlationId: string): ActiveGeneration | undefined {
    return this.byCorrelation.get(correlationId);
  }

  listByAccount(accountId: string): string[] {
    return [...(this.byAccount.get(accountId) ?? [])];
  }

  listAll(): ActiveGeneration[] {
    return [...this.byCorrelation.values()];
  }

  size(): number {
    return this.byCorrelation.size;
  }

  isEmpty(): boolean {
    return this.byCorrelation.size === 0;
  }

  async cancel(correlationId: string): Promise<boolean> {
    const gen = this.byCorrelation.get(correlationId);
    if (!gen) return false;
    await gen.cancel();
    return true;
  }

  /** Cancel every active generation; map entries remain until each finally unregisters. */
  async cancelAll(): Promise<void> {
    const gens = this.listAll();
    await Promise.allSettled(gens.map((g) => g.cancel()));
  }

  /** Force-clear after cancelAll (shutdown). */
  clear(): void {
    this.byCorrelation.clear();
    this.byAccount.clear();
  }
}
