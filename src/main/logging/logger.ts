import { FileWriter } from './file-writer';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const REDACT_KEYS = [
  'token',
  'cookie',
  'password',
  'secret',
  'credential',
  'authorization',
  'oauth',
  'localstorage',
  'sessionstorage',
];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACT_KEYS.some((k) => key.toLowerCase().includes(k))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactLogString(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function redactLogString(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '[REDACTED]');
}

class Logger {
  private fileWriter: FileWriter | null = null;

  initialize(logDir: string): void {
    this.fileWriter = new FileWriter({ logDir });
  }

  private write(entry: LogEntry): void {
    const line = JSON.stringify(entry);

    if (entry.level === 'error') {
      console.error(line);
    } else if (entry.level === 'warn') {
      console.warn(line);
    } else if (entry.level === 'debug') {
      console.debug(line);
    } else {
      console.log(line);
    }

    this.fileWriter?.write(line);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'debug',
      message,
      context: context ? redact(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'info',
      message,
      context: context ? redact(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'warn',
      message,
      context: context ? redact(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'error',
      message,
      context: context ? redact(context) : undefined,
      timestamp: new Date().toISOString(),
    });
  }
}

export const logger = new Logger();
