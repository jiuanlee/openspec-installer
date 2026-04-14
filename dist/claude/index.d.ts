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
 * Both operations are independent and run sequentially (not in parallel).
 */
export * from './skill';
export * from './mcp';
import type { ClaudeInfo } from '../detect/claude';
import type { SkillInstallResult } from './skill';
import type { McpInstallResult } from './mcp';
export interface ClaudeIntegrationOptions {
    /** Options forwarded to injectTapdSkill() */
    skill?: {
        force?: boolean;
        promptForToken?: boolean;
        /** Pre-supply token (e.g. from TAPD_API_TOKEN env var) */
        token?: string;
    };
    /** Options forwarded to registerConfluenceMcp() */
    mcp?: {
        /** 强制覆盖已存在的注册项 @default false */
        force?: boolean;
    };
}
export interface ClaudeIntegrationResult {
    skill: SkillInstallResult;
    mcp: McpInstallResult;
    /** True only when both operations succeeded */
    allSuccess: boolean;
}
/**
 * Run the full Claude Code integration in one call:
 *  1. Inject tapd-api skill into ~/.claude/skills/
 *  2. Register confluence-mcp (HTTP mode) in ~/.claude/settings.json
 *
 * Only call this when claudeInfo.installed === true.
 *
 * @example
 * if (claudeInfo.installed) {
 *   const result = await runClaudeIntegration(claudeInfo, {
 *     skill: { token: process.env['TAPD_API_TOKEN'] },
 *   });
 * }
 */
export declare function runClaudeIntegration(claudeInfo: ClaudeInfo, opts?: ClaudeIntegrationOptions): Promise<ClaudeIntegrationResult>;
//# sourceMappingURL=index.d.ts.map