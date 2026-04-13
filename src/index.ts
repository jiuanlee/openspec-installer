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
 *               └─ registerConfluenceMcp() → merges ~/.claude/settings.json
 *
 * Environment variables consumed at runtime:
 *   OPENSPEC_NPM_REGISTRY  custom npm registry for openspec install (optional)
 *   TAPD_API_TOKEN         TAPD personal API token — skips interactive prompt
 *   CONF_BASE_URL          Confluence base URL    — skips interactive prompt
 *   CONF_MODE              server | cloud         (default: server)
 *   CONF_AUTH_MODE         auto | basic | bearer  (default: auto)
 *   CONF_USERNAME          Confluence username
 *   CONF_TOKEN             Confluence access token
 *   CONF_DEFAULT_SPACE     default Confluence space key (optional)
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

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function section(title: string): void {
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(40));
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

// ─────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║         openspec-installer v1.0.0        ║');
  console.log('╚══════════════════════════════════════════╝');

  // ────────────────────────────────────────────
  // Phase 1 — Detection
  // ────────────────────────────────────────────
  section('Phase 1 · Detection');

  const osInfo = detectOs();
  console.log('[os]     ', formatOsInfo(osInfo));
  assertSupportedArch(osInfo);  // throws on unsupported arch → caught by main().catch

  const claudeInfo = detectClaude(osInfo);
  console.log('[claude] ', formatClaudeInfo(claudeInfo));

  if (!claudeInfo.installed) {
    console.warn(
      '\n[warn] Claude Code not found on PATH.\n' +
      '       Phase 3 (skill + MCP injection) will be skipped.\n' +
      '       Install Claude Code and re-run to complete setup.'
    );
  }

  // ────────────────────────────────────────────
  // Phase 2 — Installation
  // ────────────────────────────────────────────
  section('Phase 2 · Install Node.js >= 22');

  const nodeResult = await ensureNode(osInfo);
  console.log(formatNodeResult(nodeResult));

  if (!nodeResult.success) {
    console.error('\n[fatal] Node.js >= 22 is required. Aborting.');
    process.exit(1);
  }

  section('Phase 2 · Install openspec');

  const openspecResult = await ensureOpenspec(osInfo, {
    registry: env('OPENSPEC_NPM_REGISTRY'),
  });
  console.log(formatOpenspecResult(openspecResult));

  if (!openspecResult.success) {
    console.error('\n[fatal] openspec installation failed. Aborting.');
    process.exit(1);
  }

  // ────────────────────────────────────────────
  // Phase 3 — Claude Code Integration
  // ────────────────────────────────────────────
  if (!claudeInfo.installed) {
    console.log('\n[skip] Phase 3 skipped — Claude Code not installed.\n');
    printSummary({ nodeResult, openspecResult, claudeSkipped: true });
    return;
  }

  section('Phase 3 · Claude Code Integration');

  const integrationResult = await runClaudeIntegration(claudeInfo, {
    skill: {
      promptForToken: true,
      token:          env('TAPD_API_TOKEN'),
    },
    mcp: {
      promptForConfig: true,
      config: {
        baseUrl:      env('CONF_BASE_URL'),
        mode:         env('CONF_MODE') as 'server' | 'cloud' | undefined,
        authMode:     env('CONF_AUTH_MODE') as 'auto' | 'basic' | 'bearer' | undefined,
        username:     env('CONF_USERNAME'),
        token:        env('CONF_TOKEN'),
        defaultSpace: env('CONF_DEFAULT_SPACE'),
      },
    },
  });

  console.log('\n[tapd-api]      ', formatSkillResult(integrationResult.skill));
  console.log('[confluence-mcp]', formatMcpResult(integrationResult.mcp));

  if (!integrationResult.allSuccess) {
    console.warn('\n[warn] One or more Phase 3 steps failed — see warnings above.');
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
  console.log('\n');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║              Install Summary             ║');
  console.log('╠══════════════════════════════════════════╣');

  const ok  = (v: boolean) => v ? '✔' : '✘';
  const ver = (v: string | null | undefined) => v ? ` (${v})` : '';

  console.log(`║  Node.js        ${ok(nodeResult.success)}${ver(nodeResult.version?.raw).padEnd(26)}║`);
  console.log(`║  openspec       ${ok(openspecResult.success)}${ver(openspecResult.version?.raw).padEnd(26)}║`);

  if (claudeSkipped) {
    console.log('║  tapd-api       - (Claude not installed)  ║');
    console.log('║  confluence-mcp - (Claude not installed)  ║');
  } else if (integrationResult) {
    const skillToken = integrationResult.skill.tokenConfigured ? ' token:✔' : ' token:✘';
    const mcpCred    = integrationResult.mcp.envConfigured     ? ' cred:✔'  : ' cred:✘';
    console.log(`║  tapd-api       ${ok(integrationResult.skill.success)}${skillToken.padEnd(26)}║`);
    console.log(`║  confluence-mcp ${ok(integrationResult.mcp.success)}${mcpCred.padEnd(26)}║`);
  }

  console.log('╚══════════════════════════════════════════╝');

  const hasWarnings =
    nodeResult.warnings.length > 0 ||
    openspecResult.warnings.length > 0 ||
    (integrationResult?.skill.warnings.length ?? 0) > 0 ||
    (integrationResult?.mcp.warnings.length   ?? 0) > 0;

  if (hasWarnings) {
    console.log('\nPending actions:');
    for (const w of [
      ...nodeResult.warnings,
      ...openspecResult.warnings,
      ...(integrationResult?.skill.warnings ?? []),
      ...(integrationResult?.mcp.warnings   ?? []),
    ]) {
      console.log(`  • ${w}`);
    }
  }

  console.log('\n  Done. Run `openspec --help` to get started.\n');
}

// ─────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────

main().catch(err => {
  console.error('\n[fatal]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
