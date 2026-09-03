/**
 * Optional semantic retrieval interface — embeddings OFF by default.
 * Implement with a local embedding model in a future phase.
 */

export interface SemanticMatch {
  entityType: string;
  entityId: string;
  score: number;
  snippet: string;
}

export interface SemanticRetrieveOptions {
  projectId: string;
  anchorChapter: number;
  limit?: number;
}

export interface SemanticRetriever {
  readonly enabled: boolean;
  retrieve(query: string, options: SemanticRetrieveOptions): Promise<SemanticMatch[]>;
}

/** Default: semantic retrieval disabled — FTS + exact matching only. */
export class NoOpSemanticRetriever implements SemanticRetriever {
  readonly enabled = false;

  async retrieve(): Promise<SemanticMatch[]> {
    await Promise.resolve();
    return [];
  }
}

let defaultRetriever: SemanticRetriever = new NoOpSemanticRetriever();

export function getSemanticRetriever(): SemanticRetriever {
  return defaultRetriever;
}

/** Test hook — inject a real retriever when embeddings ship. */
export function setSemanticRetriever(retriever: SemanticRetriever): void {
  defaultRetriever = retriever;
}

export function resetSemanticRetriever(): void {
  defaultRetriever = new NoOpSemanticRetriever();
}
