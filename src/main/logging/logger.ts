import { FileWriter } from './file-writer';
import { sanitizeLogContext, redactSecretsInString } from '../security/log-sanitize';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  return sanitizeLogContext(obj);
}

class Logger {
  private fileWriter: FileWriter | null = null;

  initialize(logDir: string): void {
    this.fileWriter = new FileWriter({ logDir });
  }

  private write(entry: LogEntry): void {
    const safeEntry: LogEntry = {
      ...entry,
      message: redactSecretsInString(entry.message),
      context: entry.context ? redact(entry.context) : undefined,
    };
    const line = JSON.stringify(safeEntry);

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
      context,
      timestamp: new Date().toISOString(),
    });
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'info',
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'warn',
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write({
      level: 'error',
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  }
}

export const logger = new Logger();
