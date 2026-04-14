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
import type { ClaudeInfo } from '../detect/claude';
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
export type SkillInstallStatus = 'already-installed' | 'installed' | 'updated' | 'failed';
export interface SkillInstallResult {
    success: boolean;
    status: SkillInstallStatus;
    skillDir: string;
    /** Files that were written in this run */
    filesWritten: string[];
    /** Files that were skipped (already present, not forced) */
    filesSkipped: string[];
    /** Whether a TAPD API token is now configured */
    tokenConfigured: boolean;
    summary: string;
    warnings: string[];
}
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
export declare function injectTapdSkill(claudeInfo: ClaudeInfo, opts?: SkillInstallOptions): Promise<SkillInstallResult>;
/**
 * Pretty-print a SkillInstallResult for CLI output.
 */
export declare function formatSkillResult(result: SkillInstallResult): string;
//# sourceMappingURL=skill.d.ts.map