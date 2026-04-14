"use strict";
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
exports.detectClaude = detectClaude;
exports.formatClaudeInfo = formatClaudeInfo;
exports.ensureSkillsDir = ensureSkillsDir;
exports.isSkillInstalled = isSkillInstalled;
exports.isMcpRegistered = isMcpRegistered;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const child_process_1 = require("child_process");
// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────
const EXEC_TIMEOUT_MS = 5_000;
/**
 * Run a shell command and return trimmed stdout.
 * Returns null on any error (command not found, timeout, non-zero exit, etc.).
 */
function tryExec(command) {
    try {
        return (0, child_process_1.execSync)(command, {
            timeout: EXEC_TIMEOUT_MS,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    }
    catch {
        return null;
    }
}
/**
 * Attempt to find the `claude` binary path via `which` (unix) or `where` (windows).
 */
function resolveBinaryPath(osInfo) {
    const command = osInfo.isWindows ? 'where claude' : 'which claude';
    const result = tryExec(command);
    if (!result)
        return null;
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
function parseVersion(raw) {
    const match = raw.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
    return match ? match[1] : null;
}
/**
 * Read ~/.claude/settings.json and extract the keys under `mcpServers`.
 * Returns an empty array if the file is missing, malformed, or has no mcpServers.
 */
function readExistingMcpServers(settingsFile) {
    try {
        const raw = fs.readFileSync(settingsFile, 'utf8');
        const parsed = JSON.parse(raw);
        const servers = parsed['mcpServers'];
        if (servers && typeof servers === 'object' && !Array.isArray(servers)) {
            return Object.keys(servers);
        }
    }
    catch {
        // File missing, unreadable, or invalid JSON — treat as empty
    }
    return [];
}
/**
 * List skill file names (without extension) inside the skills directory.
 * Returns an empty array if the directory does not exist.
 */
function readExistingSkills(skillsDir) {
    try {
        return fs.readdirSync(skillsDir)
            .filter(f => f.endsWith('.md'))
            .map(f => path.basename(f, '.md'));
    }
    catch {
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
function detectClaude(osInfo) {
    // ── 1. Probe the binary ─────────────────────────────────────────────
    const versionOutput = tryExec('claude --version');
    const installed = versionOutput !== null;
    const version = installed ? parseVersion(versionOutput) : null;
    const binaryPath = installed
        ? resolveBinaryPath(osInfo) // resolve path only when binary is confirmed
        : null;
    // ── 2. Probe the config directory ────────────────────────────────────
    const configDir = osInfo.claudeConfigDir; // ~/.claude
    const configDirExists = fs.existsSync(configDir);
    const settingsFile = path.join(configDir, 'settings.json');
    const settingsFileExists = fs.existsSync(settingsFile);
    const skillsDir = path.join(configDir, 'skills');
    const skillsDirExists = fs.existsSync(skillsDir);
    // ── 3. Inventory existing artefacts ──────────────────────────────────
    const existingSkills = readExistingSkills(skillsDir);
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
function formatClaudeInfo(info) {
    if (!info.installed) {
        return 'Claude Code: not found';
    }
    const version = info.version ? `v${info.version}` : 'version unknown';
    const binary = info.binaryPath ?? 'path unknown';
    const skills = info.existingSkills.length
        ? `[${info.existingSkills.join(', ')}]`
        : 'none';
    const mcps = info.existingMcpServers.length
        ? `[${info.existingMcpServers.join(', ')}]`
        : 'none';
    return (`Claude Code: ${version} | path: ${binary} | ` +
        `skills: ${skills} | MCP: ${mcps}`);
}
/**
 * Ensure the ~/.claude/skills directory exists, creating it if needed.
 * Safe to call multiple times (idempotent).
 */
function ensureSkillsDir(info) {
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
function isSkillInstalled(info, skillName) {
    return info.existingSkills.includes(skillName);
}
/**
 * Check whether a specific MCP server is already registered.
 *
 * @example
 * if (!isMcpRegistered(claudeInfo, 'confluence-mcp')) { ... }
 */
function isMcpRegistered(info, serverName) {
    return info.existingMcpServers.includes(serverName);
}
//# sourceMappingURL=claude.js.map