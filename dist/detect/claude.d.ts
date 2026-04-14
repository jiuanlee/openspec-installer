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
import type { OsInfo } from './os';
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
export declare function detectClaude(osInfo: OsInfo): ClaudeInfo;
/**
 * Pretty-print ClaudeInfo to a human-readable summary.
 *
 * @example
 * console.log(formatClaudeInfo(detectClaude(osInfo)));
 * // → "Claude Code: v1.2.3 | path: /usr/local/bin/claude | skills: [tapd-api] | MCP: [confluence-mcp]"
 */
export declare function formatClaudeInfo(info: ClaudeInfo): string;
/**
 * Ensure the ~/.claude/skills directory exists, creating it if needed.
 * Safe to call multiple times (idempotent).
 */
export declare function ensureSkillsDir(info: ClaudeInfo): void;
/**
 * Check whether a specific skill is already installed.
 *
 * @example
 * if (!isSkillInstalled(claudeInfo, 'tapd-api')) { ... }
 */
export declare function isSkillInstalled(info: ClaudeInfo, skillName: string): boolean;
/**
 * Check whether a specific MCP server is already registered.
 *
 * @example
 * if (!isMcpRegistered(claudeInfo, 'confluence-mcp')) { ... }
 */
export declare function isMcpRegistered(info: ClaudeInfo, serverName: string): boolean;
//# sourceMappingURL=claude.d.ts.map