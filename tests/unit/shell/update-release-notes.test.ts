import { describe, expect, it } from 'vitest';
import { formatReleaseNotesForDisplay } from '@renderer/hooks/useUpdateStatus';

describe('formatReleaseNotesForDisplay', () => {
  it('strips script tags and HTML', () => {
    const out = formatReleaseNotesForDisplay(
      '<p>Hello</p><script>alert(1)</script><a href="javascript:evil">x</a>',
    );
    expect(out).not.toContain('<script');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('Hello');
  });
});
