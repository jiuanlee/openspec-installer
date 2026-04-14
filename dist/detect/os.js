"use strict";
/**
 * os.ts — Operating System & Architecture Detection
 *
 * Responsibilities:
 *  1. Identify the OS family: windows | macos | linux
 *  2. Identify the CPU architecture: x64 | arm64
 *  3. Provide helper utilities (isWindows / isMacos / isLinux)
 *  4. Return a rich OsInfo object consumed by downstream install strategies
 *
 * Detection strategy (priority order):
 *  - process.platform  →  primary, always available in Node.js
 *  - process.arch      →  primary for arch
 *  - os.release()      →  used for supplemental version info
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
exports.detectOs = detectOs;
exports.formatOsInfo = formatOsInfo;
exports.assertSupportedArch = assertSupportedArch;
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────
/**
 * Attempt to detect WSL by checking /proc/version for Microsoft signature.
 * Falls back gracefully to false on non-Linux systems.
 */
function detectWsl() {
    if (process.platform !== 'linux')
        return false;
    try {
        // Lazy-require fs to avoid hoisting issues
        const fs = require('fs');
        const procVersion = fs.readFileSync('/proc/version', 'utf8');
        return /microsoft/i.test(procVersion);
    }
    catch {
        return false;
    }
}
/** Map process.platform to our normalised OsType. */
function resolveOsType(platform) {
    switch (platform) {
        case 'win32': return 'windows';
        case 'darwin': return 'macos';
        default: return 'linux'; // includes 'linux', 'freebsd', etc.
    }
}
/** Map process.arch to our normalised Arch. */
function resolveArch(rawArch) {
    switch (rawArch) {
        case 'x64': return 'x64';
        case 'arm64': return 'arm64';
        default: return 'unsupported';
    }
}
// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
/**
 * Detect and return full OS information.
 *
 * This function is synchronous — all inputs come from Node.js built-ins
 * and are available instantly without I/O.
 *
 * @example
 * const info = detectOs();
 * if (info.isWindows) { ... }
 */
function detectOs() {
    const rawPlatform = process.platform;
    const rawArch = process.arch;
    const type = resolveOsType(rawPlatform);
    const arch = resolveArch(rawArch);
    const homeDir = os.homedir();
    const isWsl = detectWsl();
    return {
        type,
        arch,
        rawPlatform,
        rawArch,
        release: os.release(),
        homeDir,
        claudeConfigDir: path.join(homeDir, '.claude'),
        isWsl,
        isWindows: type === 'windows',
        isMacos: type === 'macos',
        isLinux: type === 'linux',
    };
}
/**
 * Pretty-print OsInfo to a human-readable single-line summary.
 * Useful for logging at installer startup.
 *
 * @example
 * console.log(formatOsInfo(detectOs()));
 * // → "OS: macos (arm64) | release: 23.4.0 | home: /Users/alice | WSL: false"
 */
function formatOsInfo(info) {
    const wslTag = info.isWsl ? ' [WSL]' : '';
    return (`OS: ${info.type}${wslTag} (${info.arch}) | ` +
        `release: ${info.release} | ` +
        `home: ${info.homeDir}`);
}
/**
 * Throw a descriptive error when the detected arch is unsupported.
 * Call this at the entry point after detectOs() if you want hard enforcement.
 */
function assertSupportedArch(info) {
    if (info.arch === 'unsupported') {
        throw new Error(`Unsupported CPU architecture: "${info.rawArch}". ` +
            `openspec-installer supports x64 and arm64 only.`);
    }
}
//# sourceMappingURL=os.js.map