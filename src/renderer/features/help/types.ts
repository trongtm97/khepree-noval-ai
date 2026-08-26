export type HelpCalloutVariant = 'tip' | 'info' | 'warning' | 'error';

export type HelpBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'steps'; steps: { title: string; body: string }[] }
  | { type: 'callout'; variant: HelpCalloutVariant; title: string; body: string }
  | { type: 'actions'; items: { label: string; to: string }[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'faq'; items: { q: string; a: string }[] }
  | { type: 'code'; text: string }
  | { type: 'related'; articleIds: string[] };

export interface HelpArticle {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  keywords: string[];
  order: number;
  relatedIds?: string[];
  blocks: HelpBlock[];
}

export interface HelpCategory {
  id: string;
  label: string;
  order: number;
}

export interface HelpSearchResult {
  article: HelpArticle;
  score: number;
  snippet: string;
}
