import { newId } from '../../db/utils/uuid';

/** Marker prefix — kept outside translation protocol tags. */
export const REQUEST_MARKER_PREFIX = 'NTS_REQUEST_REF:';

export function buildRequestMarker(requestId?: string): {
  requestId: string;
  marker: string;
  markedPrompt: (prompt: string) => string;
} {
  const id = requestId ?? newId();
  const marker = `${REQUEST_MARKER_PREFIX} ${id}`;
  return {
    requestId: id,
    marker,
    markedPrompt: (prompt: string) => appendRequestMarker(prompt, marker),
  };
}

export function appendRequestMarker(prompt: string, marker: string): string {
  const trimmed = prompt.trimEnd();
  if (trimmed.includes(marker)) return trimmed;
  return `${trimmed}\n\n<!-- ${marker} -->`;
}

export function extractMarkerFromText(text: string): string | null {
  const inline = text.match(/NTS_REQUEST_REF:\s*([0-9a-f-]{36})/i);
  if (inline) return inline[1] ?? null;
  const comment = text.match(/<!--\s*NTS_REQUEST_REF:\s*([0-9a-f-]{36})\s*-->/i);
  return comment?.[1] ?? null;
}
