/** Tiny entity decoder — avoid pulling full XML DOM deps. */
export const XMLParser = {
  decodeEntities(input: string): string {
    return input
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
        String.fromCharCode(Number.parseInt(h, 16)),
      )
      .replace(/&amp;/gi, '&');
  },
};
