import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;

export interface FileWriterOptions {
  logDir: string;
  fileName?: string;
  maxBytes?: number;
  maxFiles?: number;
}

export class FileWriter {
  private readonly logFilePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(options: FileWriterOptions) {
    const fileName = options.fileName ?? 'noveltrans.log';
    this.logFilePath = path.join(options.logDir, fileName);
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    fs.mkdirSync(options.logDir, { recursive: true });
  }

  write(line: string): void {
    this.rotateIfNeeded();
    fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
  }

  private rotateIfNeeded(): void {
    if (!fs.existsSync(this.logFilePath)) {
      return;
    }

    const { size } = fs.statSync(this.logFilePath);
    if (size < this.maxBytes) {
      return;
    }

    const oldest = `${this.logFilePath}.${this.maxFiles}`;
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    for (let index = this.maxFiles - 1; index >= 1; index -= 1) {
      const from = `${this.logFilePath}.${index}`;
      const to = `${this.logFilePath}.${index + 1}`;
      if (fs.existsSync(from)) {
        fs.renameSync(from, to);
      }
    }

    fs.renameSync(this.logFilePath, `${this.logFilePath}.1`);
  }
}
