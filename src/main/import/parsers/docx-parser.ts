import fs from 'node:fs';
import mammoth from 'mammoth';

export async function parseDocxFile(filePath: string): Promise<{ text: string }> {
  const result = await mammoth.extractRawText({ path: filePath });
  return { text: result.value };
}

export async function parseDocxBuffer(buffer: Buffer): Promise<{ text: string }> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value };
}

export async function assertDocxReadable(filePath: string): Promise<void> {
  await fs.promises.access(filePath, fs.constants.R_OK);
}
