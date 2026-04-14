#!/usr/bin/env node
"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const os_1 = require("./detect/os");
const claude_1 = require("./detect/claude");
const node_1 = require("./install/node");
const openspec_1 = require("./install/openspec");
const claude_2 = require("./claude");
const logger_1 = require("./logger");
const cli_1 = require("./cli");
// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function env(key) {
    const v = process.env[key];
    return v && v.length > 0 ? v : undefined;
}
// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────
async function main() {
    // ── Parse CLI args (exits early on --help / --version) ───────────────
    const args = (0, cli_1.parseArgs)();
    logger_1.logger.raw('');
    logger_1.logger.raw('+==========================================+');
    logger_1.logger.raw('|         openspec-installer v1.0.0        |');
    logger_1.logger.raw('+==========================================+');
    if (args.force) {
        logger_1.logger.warn('--force enabled: all components will be reinstalled.');
    }
    // ────────────────────────────────────────────
    // Phase 1 — Detection
    // ────────────────────────────────────────────
    logger_1.logger.section('Phase 1 - Detection');
    const osInfo = (0, os_1.detectOs)();
    logger_1.logger.info((0, os_1.formatOsInfo)(osInfo));
    (0, os_1.assertSupportedArch)(osInfo);
    const claudeInfo = (0, claude_1.detectClaude)(osInfo);
    logger_1.logger.info((0, claude_1.formatClaudeInfo)(claudeInfo));
    if (!claudeInfo.installed) {
        logger_1.logger.warn('Claude Code not found on PATH.');
        logger_1.logger.warn('Phase 3 (skill + MCP injection) will be skipped.');
        logger_1.logger.warn('Install Claude Code and re-run to complete setup.');
    }
    // ────────────────────────────────────────────
    // Phase 2 — Installation
    // ────────────────────────────────────────────
    // ── Node.js ──────────────────────────────────────────────────────────
    logger_1.logger.section('Phase 2 - Install Node.js >= 22');
    if (args.skipNode) {
        logger_1.logger.info('--skip-node: skipping Node.js check.');
    }
    else {
        const nodeResult = await (0, node_1.ensureNode)(osInfo);
        logger_1.logger.raw((0, node_1.formatNodeResult)(nodeResult));
        if (!nodeResult.success) {
            logger_1.logger.error('Node.js >= 22 is required. Aborting.');
            process.exit(1);
        }
    }
    // ── openspec ─────────────────────────────────────────────────────────
    logger_1.logger.section('Phase 2 - Install openspec');
    if (args.skipOpenspec) {
        logger_1.logger.info('--skip-openspec: skipping openspec install.');
    }
    else {
        const openspecResult = await (0, openspec_1.ensureOpenspec)(osInfo, {
            registry: env('OPENSPEC_NPM_REGISTRY'),
            force: args.forceOpenspec,
        });
        logger_1.logger.raw((0, openspec_1.formatOpenspecResult)(openspecResult));
        if (!openspecResult.success) {
            logger_1.logger.error('openspec installation failed. Aborting.');
            process.exit(1);
        }
    }
    // ────────────────────────────────────────────
    // Phase 3 — Claude Code Integration
    // ────────────────────────────────────────────
    if (args.skipClaude || !claudeInfo.installed) {
        if (args.skipClaude) {
            logger_1.logger.info('--skip-claude: skipping Phase 3.');
        }
        else {
            logger_1.logger.warn('Phase 3 skipped - Claude Code not installed.');
        }
        printSummary({ claudeSkipped: true });
        return;
    }
    logger_1.logger.section('Phase 3 - Claude Code Integration');
    if (args.forceSkill)
        logger_1.logger.warn('--force-skill: tapd-api will be reinstalled.');
    if (args.forceMcp)
        logger_1.logger.warn('--force-mcp: confluence-mcp will be re-registered.');
    const integrationResult = await (0, claude_2.runClaudeIntegration)(claudeInfo, {
        skill: {
            force: args.forceSkill,
            promptForToken: true,
            token: env('TAPD_API_TOKEN'),
        },
        mcp: {
            force: args.forceMcp,
        },
    });
    logger_1.logger.raw((0, claude_2.formatSkillResult)(integrationResult.skill));
    logger_1.logger.raw((0, claude_2.formatMcpResult)(integrationResult.mcp));
    if (!integrationResult.allSuccess) {
        logger_1.logger.warn('One or more Phase 3 steps failed - see warnings above.');
    }
    printSummary({ integrationResult, claudeSkipped: false });
}
function printSummary({ integrationResult, claudeSkipped }) {
    const ok = (v) => v ? '[ok]' : '[x]';
    logger_1.logger.raw('');
    logger_1.logger.raw('+==========================================+');
    logger_1.logger.raw('|              Install Summary             |');
    logger_1.logger.raw('+==========================================+');
    if (claudeSkipped) {
        logger_1.logger.raw('|  tapd-api       - (skipped)               |');
        logger_1.logger.raw('|  confluence-mcp - (skipped)               |');
    }
    else if (integrationResult) {
        const skillToken = integrationResult.skill.tokenConfigured ? ' token:[ok]' : ' token:[x]';
        const mcpStatus = integrationResult.mcp.success ? ' http:[ok]' : ' http:[x]';
        logger_1.logger.raw(`|  tapd-api       ${ok(integrationResult.skill.success)}${skillToken.padEnd(26)}|`);
        logger_1.logger.raw(`|  confluence-mcp ${ok(integrationResult.mcp.success)}${mcpStatus.padEnd(26)}|`);
    }
    logger_1.logger.raw('+==========================================+');
    const allWarnings = [
        ...(integrationResult?.skill.warnings ?? []),
        ...(integrationResult?.mcp.warnings ?? []),
    ];
    if (allWarnings.length > 0) {
        logger_1.logger.raw('');
        logger_1.logger.raw('Pending actions:');
        for (const w of allWarnings) {
            logger_1.logger.warn(`  - ${w}`);
        }
    }
    logger_1.logger.raw('');
    logger_1.logger.ok('Done. Run `openspec --help` to get started.');
    logger_1.logger.raw(`Log saved to: ${logger_1.logger.logFilePath()}`);
    logger_1.logger.raw('');
}
// ─────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────
main().catch(err => {
    logger_1.logger.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
    logger_1.logger.raw(`Log saved to: ${logger_1.logger.logFilePath()}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map