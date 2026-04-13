/**
 * mcp.ts — confluence-mcp-server Registration into Claude Code settings.json
 *
 * Package: confluence-mcp-server@1.1.0
 * NPM:     https://www.npmjs.com/package/confluence-mcp-server
 *
 * Responsibilities:
 *  1. Read ~/.claude/settings.json (preserves existing keys like "model")
 *  2. Merge the confluence-mcp-server entry under settings.mcpServers
 *  3. Collect required env vars interactively or from environment / opts
 *  4. Write the result atomically (tmp → fsync → rename)
 *  5. Idempotent: skip if already registered, unless force=true
 *  6. Return a typed McpInstallResult; never throw
 *
 * Real settings.json structure written by this module:
 *
 *   {
 *     "mcpServers": {
 *       "confluence-mcp": {
 *         "command": "npx",
 *         "args": ["-y", "confluence-mcp-server"],
 *         "env": {
 *           "CONF_BASE_URL":      "https://confluence.gaodunwangxiao.com",
 *           "CONF_MODE":          "server",
 *           "CONF_AUTH_MODE":     "auto",
 *           "CONF_USERNAME":      "your-username",
 *           "CONF_TOKEN":         "your-token",
 *           "CONF_DEFAULT_SPACE": ""
 *         }
 *       }
 *     }
 *   }
 *
 * Environment variables (confluence-mcp-server):
 *  CONF_BASE_URL      Confluence base URL (required)
 *  CONF_MODE          "cloud" | "server"  (default: "server")
 *  CONF_AUTH_MODE     "auto" | "basic" | "bearer"  (default: "auto")
 *  CONF_USERNAME      Login username (required for cloud; required in basic mode)
 *  CONF_TOKEN         API token (cloud: Atlassian API token; server: Bearer token)
 *  CONF_PASSWORD      Password (alternative to CONF_TOKEN in basic mode)
 *  CONF_DEFAULT_SPACE Default Confluence space key (optional)
 *
 * Atomic write strategy:
 *   write to settings.json.tmp → fsync → rename to settings.json
 */

import * as fs       from 'fs';
import * as path     from 'path';
import * as readline from 'readline';
import type { ClaudeInfo } from '../detect/claude';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SERVER_NAME   = 'confluence-mcp';
const NPM_PACKAGE   = 'confluence-mcp-server';

/**
 * Deployment mode.
 * "server" = Confluence Server / Data Center (on-premise, typical enterprise).
 * "cloud"  = Confluence Cloud (atlassian.net).
 */
export type ConfMode = 'server' | 'cloud';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface McpEnvConfig {
  /** Confluence base URL. e.g. https://confluence.gaodunwangxiao.com */
  baseUrl:      string;
  /** Deployment mode: "server" (default) or "cloud" */
  mode:         ConfMode;
  /**
   * Auth mode: "auto" (default), "basic", or "bearer".
   * "auto" tries Bearer first, then Basic.
   */
  authMode:     'auto' | 'basic' | 'bearer';
  /** Login username (required for cloud; required in basic/auto+password mode) */
  username:     string;
  /**
   * Access token.
   * Cloud: Atlassian personal API token.
   * Server: Personal access token (used as Bearer) or API token.
   * Generate at: https://confluence.gaodunwangxiao.com/plugins/personalaccesstokens/usertokens.action
   */
  token:        string;
  /** Optional default Confluence space key, e.g. "DOC" */
  defaultSpace: string;
}

export interface McpInstallOptions {
  /**
   * Overwrite an existing registration.
   * @default false
   */
  force?: boolean;

  /**
   * Interactively prompt for missing credentials when stdin is a TTY.
   * @default true
   */
  promptForConfig?: boolean;

  /**
   * Pre-supply credentials (e.g. from CI environment variables).
   * Fields not supplied here fall back to env vars → interactive prompt.
   */
  config?: Partial<McpEnvConfig>;
}

export type McpInstallStatus =
  | 'already-registered'
  | 'registered'
  | 'updated'
  | 'failed';

export interface McpInstallResult {
  success:       boolean;
  status:        McpInstallStatus;
  settingsFile:  string;
  /** True when all required fields (baseUrl + token) are non-placeholder values */
  envConfigured: boolean;
  summary:       string;
  warnings:      string[];
}

/** Internal shape of settings.json */
interface ClaudeSettings {
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

interface McpServerEntry {
  command: string;
  args:    string[];
  env?:    Record<string, string>;
}

// ─────────────────────────────────────────────
// Internal: settings.json I/O
// ─────────────────────────────────────────────

function readSettings(settingsFile: string): ClaudeSettings {
  try {
    return JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

/**
 * Atomic write: tmp → fsync → rename.
 * Prevents a corrupt settings.json if the process is killed mid-write.
 */
function writeSettingsAtomic(settingsFile: string, data: ClaudeSettings): void {
  const tmp     = settingsFile + '.tmp';
  const content = JSON.stringify(data, null, 2) + '\n';

  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });

  const fd = fs.openSync(tmp, 'w');
  fs.writeSync(fd, content);
  fs.fsyncSync(fd);
  fs.closeSync(fd);

  fs.renameSync(tmp, settingsFile);
}

// ─────────────────────────────────────────────
// Internal: credential resolution
// ─────────────────────────────────────────────

const PLACEHOLDERS = new Set([
  'https://confluence.example.com',
  'your-username',
  'your-token',
  'your_api_token',
]);

function isPlaceholder(v: string | undefined): boolean {
  return !v || PLACEHOLDERS.has(v);
}

/**
 * Resolve env config from (in priority):
 *  1. opts.config fields
 *  2. Process environment variables (CONF_*)
 *  3. Interactive TTY prompt for still-missing required fields
 */
async function resolveEnvConfig(opts: McpInstallOptions): Promise<McpEnvConfig> {
  const c = opts.config ?? {};

  const resolved: McpEnvConfig = {
    baseUrl:      c.baseUrl      ?? process.env['CONF_BASE_URL']      ?? '',
    mode:         c.mode         ?? (process.env['CONF_MODE'] as ConfMode | undefined) ?? 'server',
    authMode:     c.authMode     ?? (process.env['CONF_AUTH_MODE'] as McpEnvConfig['authMode'] | undefined) ?? 'auto',
    username:     c.username     ?? process.env['CONF_USERNAME']     ?? '',
    token:        c.token        ?? process.env['CONF_TOKEN']        ?? '',
    defaultSpace: c.defaultSpace ?? process.env['CONF_DEFAULT_SPACE'] ?? '',
  };

  const needsPrompt =
    (opts.promptForConfig ?? true) &&
    process.stdin.isTTY &&
    (isPlaceholder(resolved.baseUrl) || isPlaceholder(resolved.token));

  if (needsPrompt) {
    await promptMissingFields(resolved);
  }

  return resolved;
}

/**
 * Interactive prompt — only asks for fields that are still empty/placeholder.
 */
function promptMissingFields(cfg: McpEnvConfig): Promise<void> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n[confluence-mcp] Some Confluence credentials are missing.');
    console.log('  Docs: https://github.com/user/confluence-mcp-server#readme\n');

    const ask = (prompt: string, current: string, cb: (v: string) => void) => {
      const hint = current ? ` [${current}]` : '';
      rl.question(`  ${prompt}${hint}: `, answer => {
        const trimmed = answer.trim();
        cb(trimmed || current);
      });
    };

    function step1() {
      if (!isPlaceholder(cfg.baseUrl)) return step2();
      ask('Confluence base URL (e.g. https://confluence.gaodunwangxiao.com)', cfg.baseUrl, v => {
        cfg.baseUrl = v;
        step2();
      });
    }

    function step2() {
      if (!isPlaceholder(cfg.username)) return step3();
      ask('Username (blank to skip)', cfg.username, v => {
        cfg.username = v;
        step3();
      });
    }

    function step3() {
      if (!isPlaceholder(cfg.token)) return done();
      const tokenHint = cfg.mode === 'cloud'
        ? 'Atlassian API token (https://id.atlassian.com/manage-profile/security/api-tokens)'
        : 'Personal access token';
      ask(tokenHint, cfg.token, v => {
        cfg.token = v;
        done();
      });
    }

    function done() {
      rl.close();
      resolve();
    }

    step1();
  });
}

// ─────────────────────────────────────────────
// Internal: validation helpers
// ─────────────────────────────────────────────

function isFullyConfigured(env: McpEnvConfig): boolean {
  return !isPlaceholder(env.baseUrl) && !isPlaceholder(env.token);
}

function isEntryConfigured(entry: McpServerEntry | undefined): boolean {
  if (!entry?.env) return false;
  return (
    !isPlaceholder(entry.env['CONF_BASE_URL']) &&
    !isPlaceholder(entry.env['CONF_TOKEN'])
  );
}

// ─────────────────────────────────────────────
// Internal: build MCP entry
// ─────────────────────────────────────────────

function buildMcpEntry(cfg: McpEnvConfig): McpServerEntry {
  const env: Record<string, string> = {
    CONF_BASE_URL:  cfg.baseUrl,
    CONF_MODE:      cfg.mode,
    CONF_AUTH_MODE: cfg.authMode,
    CONF_USERNAME:  cfg.username,
    CONF_TOKEN:     cfg.token,
  };

  // Only include optional field when non-empty
  if (cfg.defaultSpace) {
    env['CONF_DEFAULT_SPACE'] = cfg.defaultSpace;
  }

  return {
    command: 'npx',
    args:    ['-y', NPM_PACKAGE],
    env,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Register confluence-mcp-server in ~/.claude/settings.json.
 *
 * Produces a settings.json entry compatible with Claude Code's MCP stdio
 * transport format, matching the pattern used by official plugins
 * (e.g. context7: `{ command: "npx", args: ["-y", "@upstash/context7-mcp"] }`).
 *
 * @example
 * // From environment variables (CI / auto-provision)
 * // CONF_BASE_URL=https://confluence.gaodunwangxiao.com
 * // CONF_TOKEN=your-personal-access-token
 * const result = await registerConfluenceMcp(claudeInfo);
 *
 * @example
 * // With pre-supplied credentials
 * const result = await registerConfluenceMcp(claudeInfo, {
 *   config: {
 *     baseUrl:  'https://confluence.gaodunwangxiao.com',
 *     mode:     'server',
 *     username: 'zhangsan',
 *     token:    'NjY4...',
 *   },
 * });
 */
export async function registerConfluenceMcp(
  claudeInfo: ClaudeInfo,
  opts: McpInstallOptions = {},
): Promise<McpInstallResult> {
  const { force = false } = opts;
  const warnings: string[] = [];
  const settingsFile       = claudeInfo.settingsFile;

  // ── Read current settings (preserve model + other keys) ──────────────
  const settings = readSettings(settingsFile);
  if (!settings.mcpServers) settings.mcpServers = {};

  const existingEntry = settings.mcpServers[SERVER_NAME];
  const alreadyExists = claudeInfo.existingMcpServers.includes(SERVER_NAME);

  // ── Early exit: already registered, credentials look valid ───────────
  if (alreadyExists && !force) {
    const envConfigured = isEntryConfigured(existingEntry);
    return {
      success:       true,
      status:        'already-registered',
      settingsFile,
      envConfigured,
      summary:       `confluence-mcp already registered in ${path.basename(settingsFile)} — skipping.`,
      warnings:      envConfigured ? [] : [
        'Existing entry has placeholder credentials. ' +
        'Edit settings.json or re-run with force=true to reconfigure.',
      ],
    };
  }

  // ── Resolve credentials ──────────────────────────────────────────────
  const envConfig    = await resolveEnvConfig(opts);
  const envConfigured = isFullyConfigured(envConfig);

  if (!envConfigured) {
    if (isPlaceholder(envConfig.baseUrl)) {
      warnings.push(
        'CONF_BASE_URL not configured. ' +
        'Edit settings.json → mcpServers["confluence-mcp"].env.CONF_BASE_URL'
      );
    }
    if (isPlaceholder(envConfig.token)) {
      warnings.push(
        'CONF_TOKEN not configured. ' +
        'For Confluence Server, generate a Personal Access Token at: ' +
        `${envConfig.baseUrl || 'https://confluence.example.com'}/plugins/personalaccesstokens/usertokens.action`
      );
    }
  }

  // ── Write settings ───────────────────────────────────────────────────
  settings.mcpServers[SERVER_NAME] = buildMcpEntry(envConfig);

  try {
    writeSettingsAtomic(settingsFile, settings);
  } catch (err) {
    return {
      success:       false,
      status:        'failed',
      settingsFile,
      envConfigured: false,
      summary:       `Failed to write ${path.basename(settingsFile)}: ${(err as Error).message}`,
      warnings,
    };
  }

  const status: McpInstallStatus = alreadyExists ? 'updated' : 'registered';

  return {
    success:       true,
    status,
    settingsFile,
    envConfigured,
    summary:
      `confluence-mcp ${status} (${NPM_PACKAGE}) in ${path.basename(settingsFile)}. ` +
      `Mode: ${envConfig.mode} | Auth: ${envConfig.authMode} | ` +
      `Credentials: ${envConfigured ? 'configured' : 'placeholder — edit settings.json before use'}.`,
    warnings,
  };
}

/**
 * Pretty-print a McpInstallResult for CLI output.
 */
export function formatMcpResult(result: McpInstallResult): string {
  const icon = result.success ? '✔' : '✘';
  const cred = result.envConfigured ? 'credentials: ✔' : 'credentials: ✘ (needs config)';
  const lines = [`${icon} confluence-mcp — ${result.summary} | ${cred}`];
  for (const w of result.warnings) {
    lines.push(`  [warn] ${w}`);
  }
  return lines.join('\n');
}
