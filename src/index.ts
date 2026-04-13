#!/usr/bin/env node
/**
 * index.ts — openspec-installer CLI entry point
 *
 * Orchestration (phases run in strict order; each phase gate-checks the previous):
 *
 *  Phase 1 ── Detection (synchronous, always runs)
 *               ├─ detectOs()      → OsInfo    (platform / arch / homeDir / claudeConfigDir)
 *               └─ detectClaude()  → ClaudeInfo (binary / version / skills / mcpServers)
 *
 *  Phase 2 ── Installation (async, fails-fast)
 *               ├─ ensureNode()    → NodeInstallResult    (winget | brew | nvm)
 *               └─ ensureOpenspec()→ OpenspecInstallResult (npm install -g)
 *
 *  Phase 3 ── Claude Code Integration (async, skipped when Claude not installed)
 *               ├─ injectTapdSkill()       → writes ~/.claude/skills/tapd-api/
 *               └─ registerConfluenceMcp() → writes ~/.claude/settings.json (HTTP mode)
 *
 * Environment variables consumed at runtime:
 *   OPENSPEC_NPM_REGISTRY  custom npm registry for openspec install (optional)
 *   TAPD_API_TOKEN         TAPD personal API token — skips interactive prompt
 *   LOG_LEVEL              debug | info | warn | error | silent  (default: info)
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
  logger.raw('');
  logger.raw('╔══════════════════════════════════════════╗');
  logger.raw('║         openspec-installer v1.0.0        ║');
  logger.raw('╚══════════════════════════════════════════╝');

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
  logger.section('Phase 2 · Install Node.js >= 22');

  const nodeResult = await ensureNode(osInfo);
  logger.raw(formatNodeResult(nodeResult));

  if (!nodeResult.success) {
    logger.error('Node.js >= 22 is required. Aborting.');
    process.exit(1);
  }

  logger.section('Phase 2 · Install openspec');

  const openspecResult = await ensureOpenspec(osInfo, {
    registry: env('OPENSPEC_NPM_REGISTRY'),
  });
  logger.raw(formatOpenspecResult(openspecResult));

  if (!openspecResult.success) {
    logger.error('openspec installation failed. Aborting.');
    process.exit(1);
  }

  // ────────────────────────────────────────────
  // Phase 3 — Claude Code Integration
  // ────────────────────────────────────────────
  if (!claudeInfo.installed) {
    logger.warn('Phase 3 skipped — Claude Code not installed.');
    printSummary({ nodeResult, openspecResult, claudeSkipped: true });
    return;
  }

  logger.section('Phase 3 · Claude Code Integration');

  const integrationResult = await runClaudeIntegration(claudeInfo, {
    skill: {
      promptForToken: true,
      token:          env('TAPD_API_TOKEN'),
    },
    mcp: {},
  });

  logger.raw(formatSkillResult(integrationResult.skill));
  logger.raw(formatMcpResult(integrationResult.mcp));

  if (!integrationResult.allSuccess) {
    logger.warn('One or more Phase 3 steps failed — see warnings above.');
  }

  // ────────────────────────────────────────────
  // Final summary
  // ────────────────────────────────────────────
  printSummary({ nodeResult, openspecResult, integrationResult, claudeSkipped: false });
}

// ─────────────────────────────────────────────
// Summary printer
// ─────────────────────────────────────────────

interface SummaryArgs {
  nodeResult:         Awaited<ReturnType<typeof ensureNode>>;
  openspecResult:     Awaited<ReturnType<typeof ensureOpenspec>>;
  integrationResult?: Awaited<ReturnType<typeof runClaudeIntegration>>;
  claudeSkipped:      boolean;
}

function printSummary({
  nodeResult,
  openspecResult,
  integrationResult,
  claudeSkipped,
}: SummaryArgs): void {
  const ok  = (v: boolean) => v ? '✔' : '✘';
  const ver = (v: string | null | undefined) => v ? ` (${v})` : '';

  logger.raw('');
  logger.raw('╔══════════════════════════════════════════╗');
  logger.raw('║              Install Summary             ║');
  logger.raw('╠══════════════════════════════════════════╣');
  logger.raw(`║  Node.js        ${ok(nodeResult.success)}${ver(nodeResult.version?.raw).padEnd(26)}║`);
  logger.raw(`║  openspec       ${ok(openspecResult.success)}${ver(openspecResult.version?.raw).padEnd(26)}║`);

  if (claudeSkipped) {
    logger.raw('║  tapd-api       - (Claude not installed)  ║');
    logger.raw('║  confluence-mcp - (Claude not installed)  ║');
  } else if (integrationResult) {
    const skillToken = integrationResult.skill.tokenConfigured ? ' token:✔' : ' token:✘';
    const mcpStatus  = integrationResult.mcp.success           ? ' http:✔'  : ' http:✘';
    logger.raw(`║  tapd-api       ${ok(integrationResult.skill.success)}${skillToken.padEnd(26)}║`);
    logger.raw(`║  confluence-mcp ${ok(integrationResult.mcp.success)}${mcpStatus.padEnd(26)}║`);
  }

  logger.raw('╚══════════════════════════════════════════╝');

  // Pending actions
  const allWarnings = [
    ...nodeResult.warnings,
    ...openspecResult.warnings,
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
  logger.ok(`Done. Run \`openspec --help\` to get started.`);
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
