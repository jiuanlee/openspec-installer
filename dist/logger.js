"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const LEVEL_RANK = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 99,
};
// ─────────────────────────────────────────────
// ANSI colour helpers
// ─────────────────────────────────────────────
const isTTY = process.stdout.isTTY === true;
const C = {
    reset: isTTY ? '\x1b[0m' : '',
    bold: isTTY ? '\x1b[1m' : '',
    dim: isTTY ? '\x1b[2m' : '',
    cyan: isTTY ? '\x1b[36m' : '',
    green: isTTY ? '\x1b[32m' : '',
    yellow: isTTY ? '\x1b[33m' : '',
    red: isTTY ? '\x1b[31m' : '',
    gray: isTTY ? '\x1b[90m' : '',
};
// ─────────────────────────────────────────────
// Log file setup
// ─────────────────────────────────────────────
const LOG_DIR = path.join(os.homedir(), '.openspec-installer');
const LOG_FILE = path.join(LOG_DIR, 'install.log');
function ensureLogDir() {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    catch {
        // silently ignore — log file is best-effort
    }
}
function appendToFile(line) {
    try {
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    }
    catch {
        // best-effort
    }
}
function filePrefix(level) {
    const ts = new Date().toISOString();
    return `${ts} [${level.toUpperCase().padEnd(5)}] `;
}
// Strip ANSI escape codes for clean file output
function stripAnsi(str) {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}
// ─────────────────────────────────────────────
// Logger class
// ─────────────────────────────────────────────
class Logger {
    level;
    constructor() {
        const env = (process.env['LOG_LEVEL'] ?? 'info').toLowerCase();
        this.level = LEVEL_RANK[env] !== undefined ? env : 'info';
        ensureLogDir();
        // Write session header to log file
        appendToFile('');
        appendToFile('─'.repeat(72));
        appendToFile(`${filePrefix('info')}openspec-installer started`);
        appendToFile(`${filePrefix('info')}log level: ${this.level}`);
    }
    shouldPrint(level) {
        return LEVEL_RANK[level] >= LEVEL_RANK[this.level];
    }
    write(level, colour, badge, msg) {
        const fileLine = filePrefix(level) + stripAnsi(msg);
        appendToFile(fileLine);
        if (!this.shouldPrint(level))
            return;
        const line = `${colour}${badge}${C.reset} ${msg}`;
        if (level === 'error') {
            process.stderr.write(line + '\n');
        }
        else {
            process.stdout.write(line + '\n');
        }
    }
    debug(msg) {
        this.write('debug', C.gray, `${C.gray}[debug]${C.reset}`, `${C.gray}${msg}${C.reset}`);
    }
    info(msg) {
        this.write('info', C.cyan, `${C.cyan}[info] ${C.reset}`, msg);
    }
    ok(msg) {
        this.write('info', C.green, `${C.green}[ok]   ${C.reset}`, msg);
    }
    warn(msg) {
        this.write('warn', C.yellow, `${C.yellow}[warn] ${C.reset}`, `${C.yellow}${msg}${C.reset}`);
    }
    error(msg) {
        this.write('error', C.red, `${C.red}[error]${C.reset}`, `${C.red}${msg}${C.reset}`);
    }
    /** Print a bare line with no badge (used for box drawing, summaries) */
    raw(msg) {
        appendToFile(stripAnsi(msg));
        if (this.shouldPrint('info'))
            process.stdout.write(msg + '\n');
    }
    /** Section banner */
    section(title) {
        const line = `${C.bold}── ${title} ──${C.reset}`;
        this.raw('');
        this.raw(line);
    }
    /** Log the path to the log file (shown at end of install) */
    logFilePath() {
        return LOG_FILE;
    }
}
// ─────────────────────────────────────────────
// Singleton export
// ─────────────────────────────────────────────
exports.logger = new Logger();
//# sourceMappingURL=logger.js.map