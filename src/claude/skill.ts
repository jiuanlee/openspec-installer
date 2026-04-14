/**
 * skill.ts — tapd-api Skill Injection into Claude Code
 *
 * Responsibilities:
 *  1. Copy the entire tapd-api skill directory into ~/.claude/skills/tapd-api/
 *     Skill directory layout (mirrors the real skill structure):
 *       tapd-api/
 *         SKILL.md            ← skill manifest (trigger / description / version)
 *         tapd_api.py         ← Python API client
 *         setup.py            ← interactive token setup helper
 *         config.example.json ← token config template (never overwrite config.json)
 *
 *  2. Idempotent: skip files that already exist unless `force` is true.
 *     config.json is NEVER overwritten — it holds the user's live API token.
 *
 *  3. After copying files, offer an interactive token-setup step:
 *       - If config.json is missing → prompt the user for a token now
 *       - Write ~/.claude/skills/tapd-api/config.json
 *
 *  4. Backup: if the skill directory already exists and force=true,
 *     rename it to tapd-api.bak.<timestamp> before overwriting.
 *
 *  5. Return a typed SkillInstallResult; never throw.
 *
 * Source asset strategy:
 *  The installer bundles the skill source files inside its own package under
 *  assets/skills/tapd-api/. At build time these are copied to dist/assets/.
 *  At runtime we resolve the path relative to this module's __dirname.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { ClaudeInfo } from '../detect/claude';
import { logger } from '../logger';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SKILL_NAME        = 'tapd-api';
/** Files distributed with the installer (relative to assets/skills/tapd-api/) */
const SKILL_ASSET_FILES = [
  'SKILL.md',
  'tapd_api.py',
  'setup.py',
  'config.example.json',
] as const;

/** This file must NEVER be overwritten — it holds the live API token */
const PROTECTED_FILES = new Set(['config.json']);

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface SkillInstallOptions {
  /**
   * Overwrite existing skill files (except config.json).
   * When false (default), existing files are skipped.
   */
  force?: boolean;

  /**
   * Interactively prompt the user for a TAPD API token if config.json
   * is missing after the file copy step.
   * @default true
   */
  promptForToken?: boolean;

  /**
   * Pre-supply a token (e.g. from env var TAPD_API_TOKEN).
   * When provided, skips the interactive prompt.
   */
  token?: string;
}

export type SkillInstallStatus =
  | 'already-installed'   // skill present and force=false
  | 'installed'           // freshly installed
  | 'updated'             // force=true, files refreshed
  | 'failed';             // unrecoverable error

export interface SkillInstallResult {
  success:        boolean;
  status:         SkillInstallStatus;
  skillDir:       string;
  /** Files that were written in this run */
  filesWritten:   string[];
  /** Files that were skipped (already present, not forced) */
  filesSkipped:   string[];
  /** Whether a TAPD API token is now configured */
  tokenConfigured: boolean;
  summary:        string;
  warnings:       string[];
}

// ─────────────────────────────────────────────
// Internal: asset resolution
// ─────────────────────────────────────────────

/**
 * Resolve the bundled skill asset directory.
 *
 * Layout inside the installer package:
 *   dist/
 *     claude/skill.js        ← this module (compiled)
 *     assets/
 *       skills/
 *         tapd-api/          ← skill source files
 *
 * During development (ts-node), __dirname is src/claude/, so we walk up
 * two levels to the project root and look in assets/.
 */
function resolveAssetDir(): string {
  // compiled:    dist/claude/  → ../../assets/skills/tapd-api
  // development: src/claude/   → ../../assets/skills/tapd-api
  return path.resolve(__dirname, '..', '..', 'assets', 'skills', SKILL_NAME);
}

// ─────────────────────────────────────────────
// Internal: file operations
// ─────────────────────────────────────────────

/** Safely read a file; returns null on any error. */
function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/** Write a file, creating parent directories as needed. */
function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: 'utf8' });
}

/**
 * Backup an existing skill directory by renaming it with a timestamp suffix.
 * E.g. tapd-api → tapd-api.bak.1712345678901
 */
function backupSkillDir(skillDir: string): string {
  const backupPath = `${skillDir}.bak.${Date.now()}`;
  fs.renameSync(skillDir, backupPath);
  return backupPath;
}

// ─────────────────────────────────────────────
// Internal: interactive token prompt
// ─────────────────────────────────────────────

/**
 * Prompt the user to enter their TAPD API token interactively.
 * Returns the trimmed token string, or null if the user skips.
 */
function promptForToken(): Promise<string | null> {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input:  process.stdin,
      output: process.stdout,
    });

    logger.warn('\n[tapd-api] TAPD API token not found.');
    logger.info('  Get yours at: https://www.tapd.cn/tapd_api_token/token');
    rl.question('  Enter API token (leave blank to skip): ', answer => {
      rl.close();
      const token = answer.trim();
      resolve(token.length > 0 ? token : null);
    });
  });
}

/**
 * Write config.json with the given token.
 * Uses the same format expected by tapd_api.py.
 */
function writeTokenConfig(skillDir: string, token: string): void {
  const configPath = path.join(skillDir, 'config.json');
  const config = { api_token: token };
  writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Check whether a valid config.json already exists in the skill directory.
 */
function hasTokenConfig(skillDir: string): boolean {
  try {
    const raw    = fs.readFileSync(path.join(skillDir, 'config.json'), 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const token  = parsed['api_token'];
    return typeof token === 'string' && token.length > 0 && token !== 'your_api_token_here';
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// Internal: asset content (embedded fallback)
// ─────────────────────────────────────────────

/**
 * Returns the content for each bundled skill file.
 *
 * We embed the content directly here as a fallback so the installer works
 * even when the assets/ directory is not present (e.g. npx invocation from
 * the npm registry without the full source tree).
 *
 * The source of truth for these strings is assets/skills/tapd-api/.
 * Keep in sync when updating the skill.
 */
function getEmbeddedAssets(): Record<string, string> {
  return {
    'SKILL.md': `---
name: tapd-api
description: Fetch TAPD requirement/story/bug details using personal API token with Bearer authentication. Use when user provides TAPD link and has API token configured.
version: 1.1.0
---

# TAPD API Client

Fetch TAPD requirement/story/bug details using personal API token via TAPD Open Platform API.

## Configuration

### Step 1: Get Your TAPD API Token

1. Login to TAPD (https://www.tapd.cn)
2. Go to: **个人设置** > **API 访问** > **申请令牌**
3. Or visit: https://www.tapd.cn/tapd_api_token/token
4. Create a new token and copy it

### Step 2: Configure Token

Save your API token to \`~/.claude/skills/tapd-api/config.json\`:

\`\`\`json
{
  "api_token": "your_api_token_here"
}
\`\`\`

Or run the setup command:
\`\`\`bash
python ~/.claude/skills/tapd-api/setup.py
\`\`\`

## Usage

Provide a TAPD link and Claude Code will automatically fetch the requirement details:
\`\`\`
https://www.tapd.cn/tapd_fe/37748852/story/detail/1137748852001368717
\`\`\`

### Supported URL Types

| Type | URL Pattern |
|------|-------------|
| Story/故事 | \`/story/detail/{id}\` |
| Requirement/需求 | \`/requirement/detail/{id}\` |
| Bug/缺陷 | \`/bug/view/{id}\` |
| Task/任务 | \`/task/view/{id}\` |

## Troubleshooting

- **Invalid Token**: Check config.json or regenerate at https://www.tapd.cn/tapd_api_token/token
- **Permission Denied**: Ensure your account has workspace access
- **Resource Not Found**: Verify the URL/ID is correct
`,

    'config.example.json': JSON.stringify({ api_token: 'your_api_token_here' }, null, 2) + '\n',
  };
}

// ─────────────────────────────────────────────
// Internal: copy skill files
// ─────────────────────────────────────────────

interface CopyResult {
  filesWritten: string[];
  filesSkipped: string[];
  warnings:     string[];
}

/**
 * Copy skill asset files from the asset directory (or embedded fallback)
 * into the target skill directory.
 *
 * Rules:
 *  - PROTECTED_FILES (config.json) are never overwritten
 *  - Existing non-protected files are skipped unless force=true
 */
function copySkillFiles(
  targetDir:   string,
  force:       boolean,
): CopyResult {
  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];
  const warnings:     string[] = [];

  fs.mkdirSync(targetDir, { recursive: true });

  const assetDir       = resolveAssetDir();
  const assetDirExists = fs.existsSync(assetDir);
  const embedded       = getEmbeddedAssets();

  for (const filename of SKILL_ASSET_FILES) {
    const destPath = path.join(targetDir, filename);

    // Hard rule: never overwrite config.json
    if (PROTECTED_FILES.has(filename)) {
      filesSkipped.push(filename);
      continue;
    }

    // Skip existing files unless forced
    if (!force && fs.existsSync(destPath)) {
      filesSkipped.push(filename);
      continue;
    }

    // Resolve content: prefer asset directory, fall back to embedded
    let content: string | null = null;

    if (assetDirExists) {
      content = readFile(path.join(assetDir, filename));
    }

    // Embedded fallback (only available for SKILL.md and config.example.json)
    if (content === null) {
      content = embedded[filename] ?? null;
    }

    if (content === null) {
      warnings.push(
        `Asset file "${filename}" not found in asset directory (${assetDir}) ` +
        `and has no embedded fallback. Skipping.`
      );
      continue;
    }

    writeFile(destPath, content);
    filesWritten.push(filename);
  }

  return { filesWritten, filesSkipped, warnings };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Inject the tapd-api skill into Claude Code's skills directory.
 *
 * @param claudeInfo — result of detectClaude(), provides target paths
 * @param opts       — install options (force, promptForToken, token)
 *
 * @example
 * const result = await injectTapdSkill(claudeInfo, { promptForToken: true });
 * if (result.success) console.log(result.summary);
 */
export async function injectTapdSkill(
  claudeInfo: ClaudeInfo,
  opts: SkillInstallOptions = {},
): Promise<SkillInstallResult> {
  const {
    force           = false,
    promptForToken  = true,
    token: preToken = undefined,
  } = opts;

  const warnings:     string[] = [];
  const skillDir               = path.join(claudeInfo.skillsDir, SKILL_NAME);
  const alreadyExists          = claudeInfo.existingSkills.includes(SKILL_NAME);

  // ── Early exit: already installed and not forced ─────────────────────
  if (alreadyExists && !force) {
    const tokenConfigured = hasTokenConfig(skillDir);
    return {
      success:         true,
      status:          'already-installed',
      skillDir,
      filesWritten:    [],
      filesSkipped:    SKILL_ASSET_FILES.slice(),
      tokenConfigured,
      summary:         `tapd-api skill already installed at ${skillDir} - skipping (use force=true to overwrite).`,
      warnings:        tokenConfigured ? [] : [
        'tapd-api has no API token configured. Run `python ~/.claude/skills/tapd-api/setup.py` to add one.',
      ],
    };
  }

  // ── Backup existing directory when forcing ───────────────────────────
  if (alreadyExists && force) {
    try {
      const backupPath = backupSkillDir(skillDir);
      warnings.push(`Existing skill directory backed up to ${backupPath}`);
    } catch (err) {
      return {
        success:         false,
        status:          'failed',
        skillDir,
        filesWritten:    [],
        filesSkipped:    [],
        tokenConfigured: false,
        summary:         `Failed to back up existing skill directory: ${(err as Error).message}`,
        warnings,
      };
    }
  }

  // ── Copy skill files ─────────────────────────────────────────────────
  let copyResult: CopyResult;
  try {
    copyResult = copySkillFiles(skillDir, force);
  } catch (err) {
    return {
      success:         false,
      status:          'failed',
      skillDir,
      filesWritten:    [],
      filesSkipped:    [],
      tokenConfigured: false,
      summary:         `Failed to copy skill files: ${(err as Error).message}`,
      warnings,
    };
  }

  warnings.push(...copyResult.warnings);

  // ── Token configuration ──────────────────────────────────────────────
  let tokenConfigured = hasTokenConfig(skillDir);

  if (!tokenConfigured) {
    let resolvedToken: string | null = preToken ?? null;

    // Use env var if available
    if (!resolvedToken) {
      resolvedToken = process.env['TAPD_API_TOKEN'] ?? null;
      if (resolvedToken) {
        logger.info('[tapd-api] Using TAPD_API_TOKEN environment variable.');
      }
    }

    // Interactively prompt if allowed and still no token
    if (!resolvedToken && promptForToken && process.stdin.isTTY) {
      resolvedToken = await promptForToken_();
    }

    if (resolvedToken) {
      try {
        writeTokenConfig(skillDir, resolvedToken);
        tokenConfigured = true;
        copyResult.filesWritten.push('config.json');
        logger.ok('[tapd-api] API token saved to config.json.');
      } catch (err) {
        warnings.push(
          `Could not write config.json: ${(err as Error).message}. ` +
          `Run \`python ~/.claude/skills/tapd-api/setup.py\` manually.`
        );
      }
    } else {
      warnings.push(
        'No TAPD API token configured. ' +
        'Run `python ~/.claude/skills/tapd-api/setup.py` to add one before using the skill.'
      );
    }
  }

  const status: SkillInstallStatus = alreadyExists ? 'updated' : 'installed';

  return {
    success:         true,
    status,
    skillDir,
    filesWritten:    copyResult.filesWritten,
    filesSkipped:    copyResult.filesSkipped,
    tokenConfigured,
    summary:
      `tapd-api skill ${status} at ${skillDir}. ` +
      `Written: [${copyResult.filesWritten.join(', ')}]. ` +
      `Token: ${tokenConfigured ? 'configured' : 'pending setup'}.`,
    warnings,
  };
}

// Named alias to avoid naming clash with the `promptForToken` option flag
const promptForToken_ = promptForToken;

/**
 * Pretty-print a SkillInstallResult for CLI output.
 */
export function formatSkillResult(result: SkillInstallResult): string {
  const status = result.success ? '[ok]' : '[x]';
  const token  = result.tokenConfigured ? 'token: [ok]' : 'token: [x] (needs setup)';
  const lines  = [`${status} tapd-api - ${result.summary} | ${token}`];
  for (const w of result.warnings) {
    lines.push(`  [warn] ${w}`);
  }
  return lines.join('\n');
}
