/**
 * cli.ts — CLI argument parser for openspec-installer
 *
 * Supported flags:
 *   --force           Re-install all components even if already present.
 *                     Equivalent to passing force:true to every install step.
 *
 *   --force-skill     Force re-install tapd-api skill only.
 *   --force-mcp       Force re-register confluence-mcp only.
 *   --force-openspec  Force re-install openspec only.
 *
 *   --skip-node       Skip Node.js install (assume >= 22 is on PATH).
 *   --skip-openspec   Skip openspec install.
 *   --skip-claude     Skip Phase 3 (tapd-api + confluence-mcp) entirely.
 *
 *   --version  -v     Print version and exit.
 *   --help     -h     Print usage and exit.
 *
 * No third-party parser — uses process.argv directly so the binary
 * works immediately after `npm install -g` without extra deps.
 */
export interface CliArgs {
    /** Force re-install all components */
    force: boolean;
    /** Force re-install openspec only */
    forceOpenspec: boolean;
    /** Force re-install tapd-api skill only */
    forceSkill: boolean;
    /** Force re-register confluence-mcp only */
    forceMcp: boolean;
    /** Skip Node.js install check */
    skipNode: boolean;
    /** Skip openspec install */
    skipOpenspec: boolean;
    /** Skip Phase 3 (Claude Code integration) */
    skipClaude: boolean;
}
export declare function parseArgs(argv?: string[]): CliArgs;
//# sourceMappingURL=cli.d.ts.map