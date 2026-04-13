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

import { detectOs, formatOsInfo, assertSupportedArch } from './detect/os';
import { detectClaude, formatClaudeInfo }               from './detect/claude';
import { ensureNode, formatNodeResult }                 from './install/node';
import { ensureOpenspec, formatOpenspecResult }         from './install/openspec';
import {
  runClaudeIntegration,
  formatSkillResult,
  formatMcpResult,
} from './claude';
import { logger } from './logger';
import { parseArgs } from './cli';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Parse CLI args (exits early on --help / --version) ───────────────
  const args = parseArgs();

  logger.raw('');
  logger.raw('╔══════════════════════════════════════════╗');
  logger.raw('║         openspec-installer v1.0.0        ║');
  logger.raw('╚══════════════════════════════════════════╝');

  if (args.force) {
    logger.warn('--force enabled: all components will be reinstalled.');
  }

  // ────────────────────────────────────────────
  // Phase 1 — Detection
  // ────────────────────────────────────────────
  logger.section('Phase 1 · Detection');

  const osInfo = detectOs();
  logger.info(formatOsInfo(osInfo));
  assertSupportedArch(osInfo);

  const claudeInfo = detectClaude(osInfo);
  logger.info(formatClaudeInfo(claudeInfo));

  if (!claudeInfo.installed) {
    logger.warn('Claude Code not found on PATH.');
    logger.warn('Phase 3 (skill + MCP injection) will be skipped.');
    logger.warn('Install Claude Code and re-run to complete setup.');
  }

  // ────────────────────────────────────────────
  // Phase 2 — Installation
  // ────────────────────────────────────────────

  // ── Node.js ──────────────────────────────────────────────────────────
  logger.section('Phase 2 · Install Node.js >= 22');

  if (args.skipNode) {
    logger.info('--skip-node: skipping Node.js check.');
  } else {
    const nodeResult = await ensureNode(osInfo);
    logger.raw(formatNodeResult(nodeResult));
    if (!nodeResult.success) {
      logger.error('Node.js >= 22 is required. Aborting.');
      process.exit(1);
    }
  }

  // ── openspec ─────────────────────────────────────────────────────────
  logger.section('Phase 2 · Install openspec');

  if (args.skipOpenspec) {
    logger.info('--skip-openspec: skipping openspec install.');
  } else {
    const openspecResult = await ensureOpenspec(osInfo, {
      registry: env('OPENSPEC_NPM_REGISTRY'),
      force:    args.forceOpenspec,
    });
    logger.raw(formatOpenspecResult(openspecResult));
    if (!openspecResult.success) {
      logger.error('openspec installation failed. Aborting.');
      process.exit(1);
    }
  }

  // ────────────────────────────────────────────
  // Phase 3 — Claude Code Integration
  // ────────────────────────────────────────────
  if (args.skipClaude || !claudeInfo.installed) {
    if (args.skipClaude) {
      logger.info('--skip-claude: skipping Phase 3.');
    } else {
      logger.warn('Phase 3 skipped — Claude Code not installed.');
    }
    printSummary({ claudeSkipped: true });
    return;
  }

  logger.section('Phase 3 · Claude Code Integration');

  if (args.forceSkill)  logger.warn('--force-skill: tapd-api will be reinstalled.');
  if (args.forceMcp)    logger.warn('--force-mcp: confluence-mcp will be re-registered.');

  const integrationResult = await runClaudeIntegration(claudeInfo, {
    skill: {
      force:          args.forceSkill,
      promptForToken: true,
      token:          env('TAPD_API_TOKEN'),
    },
    mcp: {
      force: args.forceMcp,
    },
  });

  logger.raw(formatSkillResult(integrationResult.skill));
  logger.raw(formatMcpResult(integrationResult.mcp));

  if (!integrationResult.allSuccess) {
    logger.warn('One or more Phase 3 steps failed — see warnings above.');
  }

  printSummary({ integrationResult, claudeSkipped: false });
}

// ─────────────────────────────────────────────
// Summary printer
// ─────────────────────────────────────────────

interface SummaryArgs {
  integrationResult?: Awaited<ReturnType<typeof runClaudeIntegration>>;
  claudeSkipped:      boolean;
}

function printSummary({ integrationResult, claudeSkipped }: SummaryArgs): void {
  const ok = (v: boolean) => v ? '✔' : '✘';

  logger.raw('');
  logger.raw('╔══════════════════════════════════════════╗');
  logger.raw('║              Install Summary             ║');
  logger.raw('╠══════════════════════════════════════════╣');

  if (claudeSkipped) {
    logger.raw('║  tapd-api       - (skipped)               ║');
    logger.raw('║  confluence-mcp - (skipped)               ║');
  } else if (integrationResult) {
    const skillToken = integrationResult.skill.tokenConfigured ? ' token:✔' : ' token:✘';
    const mcpStatus  = integrationResult.mcp.success           ? ' http:✔'  : ' http:✘';
    logger.raw(`║  tapd-api       ${ok(integrationResult.skill.success)}${skillToken.padEnd(26)}║`);
    logger.raw(`║  confluence-mcp ${ok(integrationResult.mcp.success)}${mcpStatus.padEnd(26)}║`);
  }

  logger.raw('╚══════════════════════════════════════════╝');

  const allWarnings = [
    ...(integrationResult?.skill.warnings ?? []),
    ...(integrationResult?.mcp.warnings   ?? []),
  ];

  if (allWarnings.length > 0) {
    logger.raw('');
    logger.raw('Pending actions:');
    for (const w of allWarnings) {
      logger.warn(`  • ${w}`);
    }
  }

  logger.raw('');
  logger.ok('Done. Run `openspec --help` to get started.');
  logger.raw(`Log saved to: ${logger.logFilePath()}`);
  logger.raw('');
}

// ─────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────

main().catch(err => {
  logger.error(`[fatal] ${err instanceof Error ? err.message : String(err)}`);
  logger.raw(`Log saved to: ${logger.logFilePath()}`);
  process.exit(1);
});
