/**
 * claude.ts — Claude Code Installation Detection
 *
 * Responsibilities:
 *  1. Detect whether Claude Code CLI (`claude`) is installed and executable
 *  2. Resolve the installation path and version string
 *  3. Locate the Claude config directory (~/.claude)
 *  4. Validate that key config artefacts exist (settings.json, skills/)
 *  5. Return a rich ClaudeInfo object consumed by skill/MCP injectors
 *
 * Detection strategy (priority order):
 *  a) `claude --version`         → primary: confirms binary is on PATH
 *  b) which/where fallback       → resolves install path if (a) fails
 *  c) ~/.claude directory probe  → confirms config dir exists
 *
 * All exec calls have a short timeout (5 s) so the installer never hangs
 * waiting on a broken binary.
 */

import * as fs   from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { OsInfo } from './os';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ClaudeInfo {
  /** Whether the `claude` binary was found and is executable */
  installed: boolean;
  /** Semver-like version string reported by `claude --version`, e.g. "1.2.3" */
  version: string | null;
  /** Absolute path to the `claude` binary, or null if not found */
  binaryPath: string | null;
  /** Absolute path to the Claude config directory (~/.claude) */
  configDir: string;
  /** Whether configDir exists on disk */
  configDirExists: boolean;
  /** Absolute path to ~/.claude/settings.json */
  settingsFile: string;
  /** Whether settings.json exists */
  settingsFileExists: boolean;
  /** Absolute path to ~/.claude/skills/ directory */
  skillsDir: string;
  /** Whether the skills/ directory exists */
  skillsDirExists: boolean;
  /** Names of skill files already present in ~/.claude/skills/ */
  existingSkills: string[];
  /** MCP server keys already registered in settings.json */
  existingMcpServers: string[];
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

const EXEC_TIMEOUT_MS = 5_000;

/**
 * Run a shell command and return trimmed stdout.
 * Returns null on any error (command not found, timeout, non-zero exit, etc.).
 */
function tryExec(command: string): string | null {
  try {
    return execSync(command, {
      timeout: EXEC_TIMEOUT_MS,
      stdio:   ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Attempt to find the `claude` binary path via `which` (unix) or `where` (windows).
 */
function resolveBinaryPath(osInfo: OsInfo): string | null {
  const command = osInfo.isWindows ? 'where claude' : 'which claude';
  const result  = tryExec(command);
  if (!result) return null;
  // `where` on Windows can return multiple lines; take the first
  return result.split(/\r?\n/)[0].trim() || null;
}

/**
 * Parse the version string out of `claude --version` output.
 * Handles formats like:
 *   "Claude Code 1.2.3"
 *   "claude/1.2.3 darwin-arm64 node-v22.0.0"
 *   "1.2.3"
 */
function parseVersion(raw: string): string | null {
  const match = raw.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
  return match ? match[1] : null;
}

/**
 * Read ~/.claude/settings.json and extract the keys under `mcpServers`.
 * Returns an empty array if the file is missing, malformed, or has no mcpServers.
 */
function readExistingMcpServers(settingsFile: string): string[] {
  try {
    const raw     = fs.readFileSync(settingsFile, 'utf8');
    const parsed  = JSON.parse(raw) as Record<string, unknown>;
    const servers = parsed['mcpServers'];
    if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
      return Object.keys(servers as object);
    }
  } catch {
    // File missing, unreadable, or invalid JSON — treat as empty
  }
  return [];
}

/**
 * List skill file names (without extension) inside the skills directory.
 * Returns an empty array if the directory does not exist.
 */
function readExistingSkills(skillsDir: string): string[] {
  try {
    return fs.readdirSync(skillsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => path.basename(f, '.md'));
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Detect Claude Code installation and return full metadata.
 *
 * @param osInfo — result of detectOs(), used for platform-specific commands
 *
 * @example
 * const os     = detectOs();
 * const claude = detectClaude(os);
 * if (!claude.installed) {
 *   console.warn('Claude Code not found — skipping skill injection');
 * }
 */
export function detectClaude(osInfo: OsInfo): ClaudeInfo {
  // ── 1. Probe the binary ─────────────────────────────────────────────
  const versionOutput = tryExec('claude --version');
  const installed     = versionOutput !== null;
  const version       = installed ? parseVersion(versionOutput!) : null;
  const binaryPath    = installed
    ? resolveBinaryPath(osInfo)   // resolve path only when binary is confirmed
    : null;

  // ── 2. Probe the config directory ────────────────────────────────────
  const configDir         = osInfo.claudeConfigDir;               // ~/.claude
  const configDirExists   = fs.existsSync(configDir);

  const settingsFile      = path.join(configDir, 'settings.json');
  const settingsFileExists = fs.existsSync(settingsFile);

  const skillsDir         = path.join(configDir, 'skills');
  const skillsDirExists   = fs.existsSync(skillsDir);

  // ── 3. Inventory existing artefacts ──────────────────────────────────
  const existingSkills     = readExistingSkills(skillsDir);
  const existingMcpServers = readExistingMcpServers(settingsFile);

  return {
    installed,
    version,
    binaryPath,
    configDir,
    configDirExists,
    settingsFile,
    settingsFileExists,
    skillsDir,
    skillsDirExists,
    existingSkills,
    existingMcpServers,
  };
}

/**
 * Pretty-print ClaudeInfo to a human-readable summary.
 *
 * @example
 * console.log(formatClaudeInfo(detectClaude(osInfo)));
 * // → "Claude Code: v1.2.3 | path: /usr/local/bin/claude | skills: [tapd-api] | MCP: [confluence-mcp]"
 */
export function formatClaudeInfo(info: ClaudeInfo): string {
  if (!info.installed) {
    return 'Claude Code: not found';
  }
  const version = info.version ? `v${info.version}` : 'version unknown';
  const binary  = info.binaryPath ?? 'path unknown';
  const skills  = info.existingSkills.length
    ? `[${info.existingSkills.join(', ')}]`
    : 'none';
  const mcps    = info.existingMcpServers.length
    ? `[${info.existingMcpServers.join(', ')}]`
    : 'none';

  return (
    `Claude Code: ${version} | path: ${binary} | ` +
    `skills: ${skills} | MCP: ${mcps}`
  );
}

/**
 * Ensure the ~/.claude/skills directory exists, creating it if needed.
 * Safe to call multiple times (idempotent).
 */
export function ensureSkillsDir(info: ClaudeInfo): void {
  if (!info.skillsDirExists) {
    fs.mkdirSync(info.skillsDir, { recursive: true });
  }
}

/**
 * Check whether a specific skill is already installed.
 *
 * @example
 * if (!isSkillInstalled(claudeInfo, 'tapd-api')) { ... }
 */
export function isSkillInstalled(info: ClaudeInfo, skillName: string): boolean {
  return info.existingSkills.includes(skillName);
}

/**
 * Check whether a specific MCP server is already registered.
 *
 * @example
 * if (!isMcpRegistered(claudeInfo, 'confluence-mcp')) { ... }
 */
export function isMcpRegistered(info: ClaudeInfo, serverName: string): boolean {
  return info.existingMcpServers.includes(serverName);
}
