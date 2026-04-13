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

import { logger } from './logger';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CliArgs {
  /** Force re-install all components */
  force:          boolean;
  /** Force re-install openspec only */
  forceOpenspec:  boolean;
  /** Force re-install tapd-api skill only */
  forceSkill:     boolean;
  /** Force re-register confluence-mcp only */
  forceMcp:       boolean;
  /** Skip Node.js install check */
  skipNode:       boolean;
  /** Skip openspec install */
  skipOpenspec:   boolean;
  /** Skip Phase 3 (Claude Code integration) */
  skipClaude:     boolean;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const VERSION = '1.0.0';

const USAGE = `
openspec-installer v${VERSION}

Usage:
  openspec-installer [flags]

Flags:
  --force            Re-install all components (overrides skip-* flags)
  --force-openspec   Re-install openspec even if already installed
  --force-skill      Re-inject tapd-api skill even if already present
  --force-mcp        Re-register confluence-mcp even if already registered

  --skip-node        Skip Node.js version check and install
  --skip-openspec    Skip openspec install
  --skip-claude      Skip Phase 3 (tapd-api skill + confluence-mcp)

  --version, -v      Print version and exit
  --help,    -h      Print this help and exit

Environment variables:
  TAPD_API_TOKEN         TAPD personal API token (skips interactive prompt)
  OPENSPEC_NPM_REGISTRY  Custom npm registry URL
  LOG_LEVEL              debug | info | warn | error | silent  (default: info)

Examples:
  # Normal install (idempotent — skips already-installed components)
  openspec-installer

  # Force reinstall everything
  openspec-installer --force

  # Only re-inject the tapd-api skill (e.g. after skill update)
  openspec-installer --force-skill --skip-node --skip-openspec

  # Re-register confluence-mcp only
  openspec-installer --force-mcp --skip-node --skip-openspec

  # CI install with token pre-supplied
  TAPD_API_TOKEN=xxx openspec-installer --skip-node
`.trimStart();

// ─────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────

export function parseArgs(argv: string[] = process.argv.slice(2)): CliArgs {
  // Handle --help / --version before anything else
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`openspec-installer v${VERSION}\n`);
    process.exit(0);
  }

  // Detect unknown flags and warn (don't crash — be lenient)
  const KNOWN = new Set([
    '--force', '--force-openspec', '--force-skill', '--force-mcp',
    '--skip-node', '--skip-openspec', '--skip-claude',
    '--version', '-v', '--help', '-h',
  ]);

  for (const arg of argv) {
    if (arg.startsWith('-') && !KNOWN.has(arg)) {
      logger.warn(`Unknown flag: ${arg}  (run --help to see available options)`);
    }
  }

  const has = (flag: string) => argv.includes(flag);

  const force = has('--force');

  return {
    force,
    forceOpenspec: force || has('--force-openspec'),
    forceSkill:    force || has('--force-skill'),
    forceMcp:      force || has('--force-mcp'),
    skipNode:      has('--skip-node'),
    skipOpenspec:  has('--skip-openspec'),
    skipClaude:    has('--skip-claude'),
  };
}
