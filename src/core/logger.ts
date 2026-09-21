import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITIES: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentMinLevel: LogLevel =
  (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || 'info';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatDateFolder(): string {
  return new Date().toISOString().split('T')[0]!;
}

const BASE_LOGS_DIR = path.resolve(process.cwd(), 'logs');

function writeLogToFile(level: LogLevel, line: string): void {
  try {
    const dateDir = path.join(BASE_LOGS_DIR, formatDateFolder());
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }
    fs.appendFileSync(path.join(dateDir, 'combined.log'), `${line}\n`, 'utf-8');
    if (level === 'error') {
      fs.appendFileSync(path.join(dateDir, 'error.log'), `${line}\n`, 'utf-8');
    }
  } catch {
    // Ignore file write errors so process never crashes on disk IO error
  }
}

export class Logger {
  constructor(private readonly context: string) {}

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITIES[level] < LEVEL_PRIORITIES[currentMinLevel]) {
      return;
    }

    const timestamp = formatTimestamp();
    const tag = `[${timestamp}] [${level.toUpperCase()}] [${this.context}]`;

    /* eslint-disable no-console */
    if (level === 'error') {
      console.error(tag, message, ...args);
    } else if (level === 'warn') {
      console.warn(tag, message, ...args);
    } else {
      console.log(tag, message, ...args);
    }
    /* eslint-enable no-console */

    const formattedArgs =
      args.length > 0
        ? ` ${args
            .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
            .join(' ')}`
        : '';
    const fullText = `${message}${formattedArgs}`;
    writeLogToFile(level, `${tag} ${fullText}`);

    // Buffer in memory for 1-minute periodic Discord log streaming
    recentLogEntries.push({
      timestamp: Date.now(),
      level,
      context: this.context,
      message: fullText,
    });

    if (recentLogEntries.length > MAX_LOG_BUFFER) {
      recentLogEntries.splice(0, recentLogEntries.length - MAX_LOG_BUFFER);
    }
  }
}

export interface LogEntry {
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly context: string;
  readonly message: string;
}

const MAX_LOG_BUFFER = 500;
const recentLogEntries: LogEntry[] = [];

export function getLogsSince(cutoffMs: number): LogEntry[] {
  return recentLogEntries.filter((e) => e.timestamp >= cutoffMs);
}

export function createLogger(context: string): Logger {
  return new Logger(context);
}

