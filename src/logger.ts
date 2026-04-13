/**
 * logger.ts — Unified logging for openspec-installer
 *
 * Features:
 *  1. Five log levels: debug | info | warn | error | silent
 *  2. Coloured terminal output (auto-disabled when stdout is not a TTY)
 *  3. Persistent log file: ~/.openspec-installer/install.log
 *     - Plain text (no ANSI codes)
 *     - ISO timestamp + level prefix on every line
 *     - Appended across multiple runs (history preserved)
 *  4. Section banners and summary helpers used by index.ts
 *  5. Global singleton — import { logger } from './logger'
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info('Node.js installed');
 *   logger.warn('PATH not updated');
 *   logger.error('fatal: npm failed');
 *   logger.debug('raw stdout: ...');  // only shown when LOG_LEVEL=debug
 */

import * as fs   from 'fs';
import * as os   from 'os';
import * as path from 'path';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  debug:  0,
  info:   1,
  warn:   2,
  error:  3,
  silent: 99,
};

// ─────────────────────────────────────────────
// ANSI colour helpers
// ─────────────────────────────────────────────

const isTTY = process.stdout.isTTY === true;

const C = {
  reset:  isTTY ? '\x1b[0m'  : '',
  bold:   isTTY ? '\x1b[1m'  : '',
  dim:    isTTY ? '\x1b[2m'  : '',
  cyan:   isTTY ? '\x1b[36m' : '',
  green:  isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  red:    isTTY ? '\x1b[31m' : '',
  gray:   isTTY ? '\x1b[90m' : '',
};

// ─────────────────────────────────────────────
// Log file setup
// ─────────────────────────────────────────────

const LOG_DIR  = path.join(os.homedir(), '.openspec-installer');
const LOG_FILE = path.join(LOG_DIR, 'install.log');

function ensureLogDir(): void {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // silently ignore — log file is best-effort
  }
}

function appendToFile(line: string): void {
  try {
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch {
    // best-effort
  }
}

function filePrefix(level: LogLevel): string {
  const ts = new Date().toISOString();
  return `${ts} [${level.toUpperCase().padEnd(5)}] `;
}

// Strip ANSI escape codes for clean file output
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ─────────────────────────────────────────────
// Logger class
// ─────────────────────────────────────────────

class Logger {
  private level: LogLevel;

  constructor() {
    const env = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase() as LogLevel;
    this.level = LEVEL_RANK[env] !== undefined ? env : 'info';
    ensureLogDir();

    // Write session header to log file
    appendToFile('');
    appendToFile('─'.repeat(72));
    appendToFile(`${filePrefix('info')}openspec-installer started`);
    appendToFile(`${filePrefix('info')}log level: ${this.level}`);
  }

  private shouldPrint(level: LogLevel): boolean {
    return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
  }

  private write(level: LogLevel, colour: string, badge: string, msg: string): void {
    const fileLine = filePrefix(level) + stripAnsi(msg);
    appendToFile(fileLine);

    if (!this.shouldPrint(level)) return;

    const line = `${colour}${badge}${C.reset} ${msg}`;
    if (level === 'error') {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }

  debug(msg: string): void {
    this.write('debug', C.gray,   `${C.gray}[debug]${C.reset}`, `${C.gray}${msg}${C.reset}`);
  }

  info(msg: string): void {
    this.write('info',  C.cyan,   `${C.cyan}[info] ${C.reset}`, msg);
  }

  ok(msg: string): void {
    this.write('info',  C.green,  `${C.green}[ok]   ${C.reset}`, msg);
  }

  warn(msg: string): void {
    this.write('warn',  C.yellow, `${C.yellow}[warn] ${C.reset}`, `${C.yellow}${msg}${C.reset}`);
  }

  error(msg: string): void {
    this.write('error', C.red,    `${C.red}[error]${C.reset}`, `${C.red}${msg}${C.reset}`);
  }

  /** Print a bare line with no badge (used for box drawing, summaries) */
  raw(msg: string): void {
    appendToFile(stripAnsi(msg));
    if (this.shouldPrint('info')) process.stdout.write(msg + '\n');
  }

  /** Section banner */
  section(title: string): void {
    const line = `${C.bold}── ${title} ──${C.reset}`;
    this.raw('');
    this.raw(line);
  }

  /** Log the path to the log file (shown at end of install) */
  logFilePath(): string {
    return LOG_FILE;
  }
}

// ─────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────

export const logger = new Logger();
