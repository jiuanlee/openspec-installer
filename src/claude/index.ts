/**
 * claude/index.ts — Claude Code Integration Layer
 *
 * Exports:
 *  - All types and functions from skill.ts  (tapd-api injection)
 *  - All types and functions from mcp.ts    (confluence-mcp registration)
 *  - runClaudeIntegration()                 (single-call orchestrator for index.ts)
 *
 * Dependency graph:
 *   index.ts
 *     └── claude/index.ts
 *           ├── claude/skill.ts  → reads assets/, writes ~/.claude/skills/tapd-api/
 *           └── claude/mcp.ts   → reads/writes ~/.claude/settings.json
 *
 * Both operations are independent and run sequentially (not in parallel)
 * so that interactive prompts don't interleave on the terminal.
 */

export * from './skill';
export * from './mcp';

// ── Orchestrator ─────────────────────────────────────────────────────────────

import type { ClaudeInfo }         from '../detect/claude';
import { injectTapdSkill }         from './skill';
import { registerConfluenceMcp }   from './mcp';
import type { SkillInstallResult } from './skill';
import type { McpInstallResult }   from './mcp';

export interface ClaudeIntegrationOptions {
  /** Options forwarded to injectTapdSkill() */
  skill?: {
    force?:          boolean;
    promptForToken?: boolean;
    /** Pre-supply token (e.g. from TAPD_API_TOKEN env var) */
    token?:          string;
  };
  /** Options forwarded to registerConfluenceMcp() */
  mcp?: {
    force?:           boolean;
    promptForConfig?: boolean;
    config?: {
      baseUrl?:      string;
      mode?:         'server' | 'cloud';
      authMode?:     'auto' | 'basic' | 'bearer';
      username?:     string;
      token?:        string;
      defaultSpace?: string;
    };
  };
}

export interface ClaudeIntegrationResult {
  skill: SkillInstallResult;
  mcp:   McpInstallResult;
  /** True only when both operations succeeded */
  allSuccess: boolean;
}

/**
 * Run the full Claude Code integration in one call:
 *  1. Inject tapd-api skill into ~/.claude/skills/
 *  2. Register confluence-mcp-server in ~/.claude/settings.json
 *
 * Only call this when claudeInfo.installed === true.
 *
 * @example
 * if (claudeInfo.installed) {
 *   const result = await runClaudeIntegration(claudeInfo, {
 *     skill: { token: process.env['TAPD_API_TOKEN'] },
 *     mcp:   { config: { baseUrl: process.env['CONF_BASE_URL'] } },
 *   });
 * }
 */
export async function runClaudeIntegration(
  claudeInfo: ClaudeInfo,
  opts: ClaudeIntegrationOptions = {},
): Promise<ClaudeIntegrationResult> {
  const skill = await injectTapdSkill(claudeInfo, opts.skill ?? {});
  const mcp   = await registerConfluenceMcp(claudeInfo, opts.mcp ?? {});

  return {
    skill,
    mcp,
    allSuccess: skill.success && mcp.success,
  };
}
