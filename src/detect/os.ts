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

import * as os from 'os';
import * as path from 'path';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type OsType = 'windows' | 'macos' | 'linux';
export type Arch   = 'x64' | 'arm64' | 'unsupported';

export interface OsInfo {
  /** Normalised OS family */
  type: OsType;
  /** Normalised CPU architecture */
  arch: Arch;
  /** Raw value from process.platform */
  rawPlatform: NodeJS.Platform;
  /** Raw value from process.arch */
  rawArch: string;
  /** os.release() — kernel / build version string */
  release: string;
  /** os.homedir() — user home directory */
  homeDir: string;
  /** Resolved path to ~/.claude directory */
  claudeConfigDir: string;
  /** True when running inside WSL (Windows Subsystem for Linux) */
  isWsl: boolean;
  /** Helper flags */
  isWindows: boolean;
  isMacos: boolean;
  isLinux: boolean;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Attempt to detect WSL by checking /proc/version for Microsoft signature.
 * Falls back gracefully to false on non-Linux systems.
 */
function detectWsl(): boolean {
  if (process.platform !== 'linux') return false;
  try {
    // Lazy-require fs to avoid hoisting issues
    const fs = require('fs') as typeof import('fs');
    const procVersion = fs.readFileSync('/proc/version', 'utf8');
    return /microsoft/i.test(procVersion);
  } catch {
    return false;
  }
}

/** Map process.platform to our normalised OsType. */
function resolveOsType(platform: NodeJS.Platform): OsType {
  switch (platform) {
    case 'win32':  return 'windows';
    case 'darwin': return 'macos';
    default:       return 'linux';   // includes 'linux', 'freebsd', etc.
  }
}

/** Map process.arch to our normalised Arch. */
function resolveArch(rawArch: string): Arch {
  switch (rawArch) {
    case 'x64':   return 'x64';
    case 'arm64': return 'arm64';
    default:      return 'unsupported';
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
export function detectOs(): OsInfo {
  const rawPlatform = process.platform;
  const rawArch     = process.arch;
  const type        = resolveOsType(rawPlatform);
  const arch        = resolveArch(rawArch);
  const homeDir     = os.homedir();
  const isWsl       = detectWsl();

  return {
    type,
    arch,
    rawPlatform,
    rawArch,
    release:         os.release(),
    homeDir,
    claudeConfigDir: path.join(homeDir, '.claude'),
    isWsl,
    isWindows:       type === 'windows',
    isMacos:         type === 'macos',
    isLinux:         type === 'linux',
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
export function formatOsInfo(info: OsInfo): string {
  const wslTag = info.isWsl ? ' [WSL]' : '';
  return (
    `OS: ${info.type}${wslTag} (${info.arch}) | ` +
    `release: ${info.release} | ` +
    `home: ${info.homeDir}`
  );
}

/**
 * Throw a descriptive error when the detected arch is unsupported.
 * Call this at the entry point after detectOs() if you want hard enforcement.
 */
export function assertSupportedArch(info: OsInfo): void {
  if (info.arch === 'unsupported') {
    throw new Error(
      `Unsupported CPU architecture: "${info.rawArch}". ` +
      `openspec-installer supports x64 and arm64 only.`
    );
  }
}
