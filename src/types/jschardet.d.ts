declare module 'jschardet' {
  export interface DetectionResult {
    encoding: string | null;
    confidence: number;
  }

  export function detect(buffer: Buffer | string): DetectionResult;

  const jschardet: {
    detect: typeof detect;
  };
  export default jschardet;
}
