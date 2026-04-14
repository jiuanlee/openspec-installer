#!/usr/bin/env node
/**
 * index.ts — openspec-installer CLI entry point
 *
 * Orchestration (phases run in strict order; each phase gate-checks the previous):
 *
 *  Phase 1 ── Detection (synchronous, always runs)
 *               ├─ detectOs()      → OsInfo
 *               └─ detectClaude()  → ClaudeInfo
 *
 *  Phase 2 ── Installation (async, fails-fast)
 *               ├─ ensureNode()     → skipped when --skip-node
 *               └─ ensureOpenspec() → skipped when --skip-openspec
 *                                     force-reinstalled when --force-openspec / --force
 *
 *  Phase 3 ── Claude Code Integration (skipped when --skip-claude or Claude not installed)
 *               ├─ injectTapdSkill()       → force when --force-skill / --force
 *               └─ registerConfluenceMcp() → force when --force-mcp  / --force
 *
 * Flags:   see `openspec-installer --help`
 * Env vars: TAPD_API_TOKEN, OPENSPEC_NPM_REGISTRY, LOG_LEVEL
 */
export {};
//# sourceMappingURL=index.d.ts.map