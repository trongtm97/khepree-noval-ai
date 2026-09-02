import type { ReactNode } from 'react';
import type { HelpCalloutVariant } from '../types';
import { HELP_ARTICLE_MAP } from '../content';
import { highlightText } from '../highlight';
import { OfficialContactSection } from '../../../components/contact/OfficialContactCards';

const LABELS: Record<HelpCalloutVariant, string> = {
  tip: 'Mẹo',
  info: 'Thông tin',
  warning: 'Lưu ý',
  error: 'Quan trọng',
};

interface HelpCalloutProps {
  variant: HelpCalloutVariant;
  title: string;
  body: string;
  highlight?: string;
}

export function HelpCallout({ variant, title, body, highlight }: HelpCalloutProps) {
  return (
    <aside className={`help-callout help-callout--${variant}`} role="note">
      <strong>{LABELS[variant]}: {highlightText(title, highlight)}</strong>
      <p>{highlightText(body, highlight)}</p>
    </aside>
  );
}

export function HelpSteps({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="help-steps">
      {steps.map((step, i) => (
        <li key={step.title + String(i)}>
          <strong>{step.title || `Bước ${i + 1}`}</strong>
          <p>{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function HelpFaq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="help-faq">
      {items.map((item) => (
        <details key={item.q} className="help-faq-item">
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function HelpTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="help-table-wrap">
      <table className="help-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.join('|')}>
              {row.map((cell) => (
                <td key={cell}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HelpActions({
  items,
  onNavigate,
}: {
  items: { label: string; to: string }[];
  onNavigate: (to: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="help-actions btn-row">
      {items.map((item) => (
        <button key={item.to + item.label} type="button" className="btn-primary" onClick={() => { onNavigate(item.to); }}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function HelpDangerousHtml({ html }: { html: string }) {
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function HelpArticleBody({
  blocks,
  onNavigate,
  onOpenArticle,
  searchQuery,
}: {
  blocks: import('../types').HelpBlock[];
  onNavigate: (to: string) => void;
  onOpenArticle: (id: string) => void;
  searchQuery?: string;
}) {
  const nodes: ReactNode[] = [];

  const hi = (text: string) => highlightText(text, searchQuery);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    switch (block.type) {
      case 'heading': {
        const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
        nodes.push(<Tag key={i} className={`help-h${block.level}`}>{hi(block.text)}</Tag>);
        break;
      }
      case 'paragraph':
        nodes.push(<p key={i} className="help-paragraph">{hi(block.text)}</p>);
        break;
      case 'list':
        if (block.ordered) {
          nodes.push(
            <ol key={i} className="help-list">
              {block.items.map((item) => (
                <li key={item}>{hi(item)}</li>
              ))}
            </ol>,
          );
        } else {
          nodes.push(
            <ul key={i} className="help-list">
              {block.items.map((item) => (
                <li key={item}>{hi(item)}</li>
              ))}
            </ul>,
          );
        }
        break;
      case 'steps':
        nodes.push(<HelpSteps key={i} steps={block.steps} />);
        break;
      case 'callout':
        nodes.push(
          <HelpCallout
            key={i}
            variant={block.variant}
            title={block.title}
            body={block.body}
            highlight={searchQuery}
          />,
        );
        break;
      case 'actions':
        nodes.push(<HelpActions key={i} items={block.items} onNavigate={onNavigate} />);
        break;
      case 'table':
        nodes.push(<HelpTable key={i} headers={block.headers} rows={block.rows} />);
        break;
      case 'faq':
        nodes.push(<HelpFaq key={i} items={block.items} />);
        break;
      case 'code':
        nodes.push(
          <pre key={i} className="help-code">
            <code>{block.text}</code>
          </pre>,
        );
        break;
      case 'related':
        nodes.push(
          <div key={i} className="help-related">
            <h3>Có thể bạn cũng cần</h3>
            <ul>
              {block.articleIds.map((id) => {
                const related = HELP_ARTICLE_MAP.get(id);
                return (
                  <li key={id}>
                    <button type="button" className="help-link-btn" onClick={() => { onOpenArticle(id); }}>
                      {related?.title ?? id}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
        );
        break;
      case 'official-contacts':
        nodes.push(<OfficialContactSection key={i} />);
        break;
      default:
        break;
    }
  }

  return <article className="help-article-body">{nodes}</article>;
}
