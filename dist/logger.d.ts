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
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';
declare class Logger {
    private level;
    constructor();
    private shouldPrint;
    private write;
    debug(msg: string): void;
    info(msg: string): void;
    ok(msg: string): void;
    warn(msg: string): void;
    error(msg: string): void;
    /** Print a bare line with no badge (used for box drawing, summaries) */
    raw(msg: string): void;
    /** Section banner */
    section(title: string): void;
    /** Log the path to the log file (shown at end of install) */
    logFilePath(): string;
}
export declare const logger: Logger;
export {};
//# sourceMappingURL=logger.d.ts.map