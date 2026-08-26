import fs from 'node:fs';
import { createReadStream } from 'node:fs';
import { detectAndDecode, type DecodeResult } from '../encoding';

const STREAM_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2 MiB
const SAMPLE_BYTES = 64 * 1024;

/**
 * Read TXT with encoding detection. Large files: stream into buffer chunks then decode once
 * (chapter detection needs full text; streaming avoids sync readFile for huge dumps).
 */
export async function parseTxtFile(filePath: string): Promise<DecodeResult & { byteLength: number }> {
  const stat = await fs.promises.stat(filePath);
  if (stat.size <= STREAM_THRESHOLD_BYTES) {
    const buffer = await fs.promises.readFile(filePath);
    return { ...detectAndDecode(buffer), byteLength: buffer.length };
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on('data', (chunk: string | Buffer) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      chunks.push(buf);
      total += buf.length;
    });
    stream.on('error', reject);
    stream.on('end', () => { resolve(); });
  });

  const buffer = Buffer.concat(chunks, total);
  // Peek sample already included in full buffer
  void SAMPLE_BYTES;
  return { ...detectAndDecode(buffer), byteLength: buffer.length };
}

export function parseTxtBuffer(buffer: Buffer): DecodeResult {
  return detectAndDecode(buffer);
}
