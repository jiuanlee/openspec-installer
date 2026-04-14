"use strict";
/**
 * openspec.ts — openspec Global Installation
 *
 * Responsibilities:
 *  1. Detect whether openspec is already installed (and at what version)
 *  2. Run `npm install -g openspec` when needed
 *  3. Support a custom npm registry (for enterprise / air-gapped networks)
 *  4. Verify the installation with `openspec --version`
 *  5. Return a typed result object; never throw
 *
 * Design notes:
 *  - We reuse the same runCommand() pattern from node.ts (inlined here so
 *    each module stays self-contained and independently importable).
 *  - npm is expected to already be on PATH because ensureNode() ran first.
 *    If npm is missing we surface a clear error rather than silently failing.
 *  - The install is always `--global` because openspec is a CLI tool, not a
 *    library dependency of the current project.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectOpenspecVersion = detectOpenspecVersion;
exports.ensureOpenspec = ensureOpenspec;
exports.formatOpenspecResult = formatOpenspecResult;
const child_process_1 = require("child_process");
const logger_1 = require("../logger");
// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PACKAGE_NAME = 'openspec';
const CMD_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes (npm installs can be slow)
// ─────────────────────────────────────────────
// Internal: command helpers
// ─────────────────────────────────────────────
function runCommand(command, args) {
    return new Promise(resolve => {
        const stdoutChunks = [];
        const stderrChunks = [];
        const child = (0, child_process_1.spawn)(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
            env: process.env,
        });
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            resolve({
                ok: false,
                stdout: stdoutChunks.join(''),
                stderr: `[timeout] Command exceeded ${CMD_TIMEOUT_MS / 1000}s`,
                exitCode: -1,
            });
        }, CMD_TIMEOUT_MS);
        child.stdout.on('data', (chunk) => {
            const text = chunk.toString();
            stdoutChunks.push(text);
            process.stdout.write(text);
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            stderrChunks.push(text);
            process.stderr.write(text);
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({
                ok: (code ?? -1) === 0,
                stdout: stdoutChunks.join(''),
                stderr: stderrChunks.join(''),
                exitCode: code ?? -1,
            });
        });
        child.on('error', err => {
            clearTimeout(timer);
            resolve({
                ok: false,
                stdout: stdoutChunks.join(''),
                stderr: err.message,
                exitCode: -1,
            });
        });
    });
}
function probe(command) {
    try {
        return (0, child_process_1.execSync)(command, {
            timeout: 10_000,
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .toString()
            .trim();
    }
    catch {
        return null;
    }
}
// ─────────────────────────────────────────────
// Internal: detection helpers
// ─────────────────────────────────────────────
/**
 * Detect the currently installed openspec version.
 * Returns null if openspec is not on PATH.
 */
function detectOpenspecVersion() {
    // Try `openspec --version` first
    let raw = probe('openspec --version');
    // Some CLIs print version to stderr or as part of a longer string
    if (!raw) {
        raw = probe('openspec -v');
    }
    if (!raw)
        return null;
    // Strip leading "v" and extract semver-like token
    const match = raw.match(/(\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?)/);
    return match ? { raw: match[1] } : { raw: raw.slice(0, 20) };
}
/**
 * Check whether npm is available on PATH.
 * Returns the version string or null.
 */
function detectNpm() {
    return probe('npm --version');
}
/**
 * Resolve which npm binary to use.
 * On Windows, `npm` is a .cmd file; spawn needs shell:true or the .cmd path.
 * We normalise this here so callers don't need to worry.
 */
function npmBinary(osInfo) {
    // On Windows without shell:true, `npm` won't resolve the .cmd extension.
    // The safest cross-platform approach is to use `npm.cmd` on win32.
    return osInfo.isWindows && !osInfo.isWsl ? 'npm.cmd' : 'npm';
}
// ─────────────────────────────────────────────
// Internal: install
// ─────────────────────────────────────────────
/**
 * Build the npm install argument list.
 *
 * Result example:
 *   ['install', '--global', 'openspec', '--registry', 'https://...']
 */
function buildNpmArgs(opts) {
    const args = ['install', '--global', PACKAGE_NAME];
    if (opts.registry) {
        args.push('--registry', opts.registry);
    }
    // Suppress noisy update-notifier / progress bar in CI-like contexts
    args.push('--no-fund', '--no-audit');
    return args;
}
// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
/**
 * Ensure openspec is installed globally via npm.
 *
 * Call after ensureNode() so npm is guaranteed to be on PATH.
 *
 * @example
 * const result = await ensureOpenspec(osInfo, { registry: 'https://npm.company.com' });
 * if (!result.success) {
 *   console.error(result.summary);
 *   process.exit(1);
 * }
 */
async function ensureOpenspec(osInfo, opts = {}) {
    const warnings = [];
    const previousVersion = detectOpenspecVersion();
    // ── Gate: require npm ───────────────────────────────────────────────
    const npmVersion = detectNpm();
    if (!npmVersion) {
        return {
            success: false,
            status: 'failed',
            version: null,
            previousVersion,
            summary: 'npm not found on PATH. Ensure Node.js >= 22 is installed and that ' +
                '`npm` is available before running this step.',
            warnings,
        };
    }
    // ── Skip when already installed (unless forced) ──────────────────────
    if (previousVersion && !opts.force) {
        return {
            success: true,
            status: 'already-installed',
            version: previousVersion,
            previousVersion,
            summary: `openspec ${previousVersion.raw} is already installed - skipping.`,
            warnings,
        };
    }
    // ── Run npm install -g ───────────────────────────────────────────────
    const isUpgrade = previousVersion !== null;
    const label = isUpgrade ? 'Upgrading' : 'Installing';
    logger_1.logger.info(`[openspec:npm] ${label} ${PACKAGE_NAME} globally` +
        (opts.registry ? ` (registry: ${opts.registry})` : '') + ' …');
    const npm = npmBinary(osInfo);
    const args = buildNpmArgs(opts);
    const result = await runCommand(npm, args);
    if (!result.ok) {
        // Surface actionable hints for common npm failures
        const hint = buildNpmErrorHint(result.stderr, opts);
        return {
            success: false,
            status: 'failed',
            version: null,
            previousVersion,
            summary: `npm install failed (exit ${result.exitCode}). ${hint}`,
            warnings,
        };
    }
    // ── Verify ──────────────────────────────────────────────────────────
    const installed = detectOpenspecVersion();
    if (!installed) {
        warnings.push('`npm install -g` completed but `openspec --version` is not responding. ' +
            'The global npm bin directory may not be on your PATH. ' +
            'Run `npm bin -g` to locate it and add it to your PATH.');
        return {
            success: false,
            status: 'failed',
            version: null,
            previousVersion,
            summary: 'openspec installed but binary not accessible on PATH.',
            warnings,
        };
    }
    // ── Warn if npm global bin is shadowed ──────────────────────────────
    const globalBin = probe('npm bin -g') ?? probe('npm root -g');
    if (globalBin) {
        const pathEnv = process.env['PATH'] ?? '';
        if (!pathEnv.includes(globalBin.replace(/\/node_modules$/, '/bin'))) {
            warnings.push(`The npm global bin path (${globalBin}) does not appear to be in your PATH. ` +
                `Add it to your shell profile to use openspec from any directory.`);
        }
    }
    return {
        success: true,
        status: isUpgrade ? 'upgraded' : 'installed',
        version: installed,
        previousVersion,
        summary: isUpgrade
            ? `openspec upgraded from ${previousVersion.raw} -> ${installed.raw}.`
            : `openspec ${installed.raw} installed successfully.`,
        warnings,
    };
}
/**
 * Build a human-readable hint for common npm install errors.
 */
function buildNpmErrorHint(stderr, opts) {
    if (/EACCES|permission denied/i.test(stderr)) {
        return ('Permission denied. Try running with sudo, or configure a user-level npm prefix: ' +
            '`npm config set prefix ~/.npm-global` and add `~/.npm-global/bin` to your PATH.');
    }
    if (/ENOTFOUND|getaddrinfo|network/i.test(stderr)) {
        return opts.registry
            ? `Network error reaching registry ${opts.registry}. Check your connection and registry URL.`
            : 'Network error. Check your internet connection, or specify a custom registry with --registry.';
    }
    if (/E404|not found/i.test(stderr)) {
        return `Package "${PACKAGE_NAME}" not found in the registry. Verify the package name is correct.`;
    }
    return 'Check the npm output above for details.';
}
/**
 * Pretty-print an OpenspecInstallResult for CLI output.
 */
function formatOpenspecResult(result) {
    const status = result.success ? '[ok]' : '[x]';
    const version = result.version ? ` (${result.version.raw})` : '';
    const lines = [`${status} openspec${version} - ${result.summary}`];
    for (const w of result.warnings) {
        lines.push(`  [warn] ${w}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=openspec.js.map