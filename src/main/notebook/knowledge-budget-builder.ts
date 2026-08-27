import { estimateTokens } from '../memory/budget-estimator';
import { KNOWLEDGE_METADATA_FOOTER_RESERVE } from './knowledge-ranking';

export interface KnowledgeRecord {
  /** Stable id for deterministic ordering / tie-break. */
  id: string;
  text: string;
}

export interface KnowledgeBudgetMetadata {
  includedCount: number;
  omittedCount: number;
  totalCount: number;
  charBudget: number;
  charsUsed: number;
  estimatedTokens: number;
  knowledgeVersion: string;
  section: string;
}

export interface BudgetBuildOptions {
  header: string;
  charBudget: number;
  unitLabel: string;
  knowledgeVersion: string;
  section: string;
  emptyPlaceholder?: string;
}

export interface BudgetBuildResult {
  content: string;
  metadata: KnowledgeBudgetMetadata;
}

function recordCharCost(text: string): number {
  return text.length + 1;
}

function buildMetadataFooter(input: {
  includedCount: number;
  omittedCount: number;
  knowledgeVersion: string;
  unitLabel: string;
}): string {
  const lines = [
    '---',
    `Included: ${input.includedCount.toLocaleString()} ${input.unitLabel}`,
  ];
  if (input.omittedCount > 0) {
    lines.push(
      `Omitted: ${input.omittedCount.toLocaleString()} lower-priority ${input.unitLabel}`,
    );
  }
  lines.push(`Knowledge version: ${input.knowledgeVersion}`);
  return lines.join('\n');
}

/**
 * Adds whole atomic records until char budget (minus metadata reserve) is reached.
 * Never truncates inside a record.
 */
export class KnowledgeBudgetBuilder {
  constructor(private readonly records: KnowledgeRecord[]) {}

  build(options: BudgetBuildOptions): BudgetBuildResult {
    const footer = buildMetadataFooter({
      includedCount: 0,
      omittedCount: Math.max(0, this.records.length),
      knowledgeVersion: options.knowledgeVersion,
      unitLabel: options.unitLabel,
    });
    const footerReserve = Math.max(KNOWLEDGE_METADATA_FOOTER_RESERVE, footer.length + 2);
    const bodyBudget = Math.max(0, options.charBudget - footerReserve);

    const header = options.header.trimEnd();
    let used = header.length > 0 ? header.length + 1 : 0;
    const included: KnowledgeRecord[] = [];

    for (const record of this.records) {
      const cost = recordCharCost(record.text);
      if (used + cost > bodyBudget) break;
      included.push(record);
      used += cost;
    }

    const omittedCount = this.records.length - included.length;
    const metadataFooter = buildMetadataFooter({
      includedCount: included.length,
      omittedCount,
      knowledgeVersion: options.knowledgeVersion,
      unitLabel: options.unitLabel,
    });

    const bodyParts: string[] = [];
    if (header) bodyParts.push(header);
    if (included.length > 0) {
      bodyParts.push(...included.map((r) => r.text));
    } else if (options.emptyPlaceholder) {
      bodyParts.push(options.emptyPlaceholder);
    }
    bodyParts.push(metadataFooter);

    const content = bodyParts.join('\n');
    return {
      content,
      metadata: {
        includedCount: included.length,
        omittedCount,
        totalCount: this.records.length,
        charBudget: options.charBudget,
        charsUsed: content.length,
        estimatedTokens: estimateTokens(content),
        knowledgeVersion: options.knowledgeVersion,
        section: options.section,
      },
    };
  }

  static fromRecords(records: KnowledgeRecord[]): KnowledgeBudgetBuilder {
    return new KnowledgeBudgetBuilder(records);
  }
}

export function buildBudgetedDocument(
  records: KnowledgeRecord[],
  options: BudgetBuildOptions,
): BudgetBuildResult {
  return new KnowledgeBudgetBuilder(records).build(options);
}
