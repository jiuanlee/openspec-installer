"use strict";
/**
 * node.ts — Node.js >= 22.x Installation
 *
 * Responsibilities:
 *  1. Detect the currently installed Node.js version (if any)
 *  2. Decide whether installation / upgrade is needed (semver >= 22.0.0)
 *  3. Dispatch to the correct platform strategy:
 *       windows → winget  (fallback: direct MSI download hint)
 *       macos   → brew    (fallback: nvm)
 *       linux   → nvm     (preferred for all Linux distros)
 *       WSL     → treated as linux/nvm
 *  4. Verify the installed version after the install step
 *  5. Return a typed result object; never throw — surface errors in result
 *
 * Design constraints:
 *  - All side-effecting commands are run via runCommand() which:
 *      • streams stdout/stderr live to the terminal (user sees progress)
 *      • enforces a per-command timeout
 *      • returns { ok, stdout, stderr, exitCode }
 *  - The module is pure TypeScript, no shell scripts embedded as strings
 *    except the nvm bootstrap curl (unavoidable).
 *  - All functions are independently testable (injectable OsInfo).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNodeVersion = parseNodeVersion;
exports.detectNodeVersion = detectNodeVersion;
exports.ensureNode = ensureNode;
exports.formatNodeResult = formatNodeResult;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const logger_1 = require("../logger");
// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
/** Target Node.js major version */
const NODE_TARGET_MAJOR = 22;
/** nvm installer version pinned for reproducibility */
const NVM_VERSION = '0.39.7';
/** Maximum time (ms) for any single shell command */
const CMD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// ─────────────────────────────────────────────
// Internal: command runner
// ─────────────────────────────────────────────
/**
 * Run a shell command, streaming stdout/stderr live.
 * Returns a structured result — never throws.
 */
function runCommand(command, args, options = {}) {
    return new Promise(resolve => {
        const stdoutChunks = [];
        const stderrChunks = [];
        const child = (0, child_process_1.spawn)(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: options.shell ?? false,
            env: options.env ?? process.env,
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
            const exitCode = code ?? -1;
            resolve({
                ok: exitCode === 0,
                stdout: stdoutChunks.join(''),
                stderr: stderrChunks.join(''),
                exitCode,
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
/**
 * Run a quick synchronous probe command (e.g. `node --version`).
 * Returns null on any error.
 */
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
// Internal: version helpers
// ─────────────────────────────────────────────
/**
 * Parse the output of `node --version` (e.g. "v22.3.0") into a NodeVersionInfo.
 * Returns null when the string doesn't match expected format.
 */
function parseNodeVersion(raw) {
    const match = raw.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match)
        return null;
    const major = parseInt(match[1], 10);
    return {
        raw: raw.trim(),
        major,
        satisfies: major >= NODE_TARGET_MAJOR,
    };
}
/**
 * Detect the currently active Node.js version.
 * Returns null if node is not on PATH.
 */
function detectNodeVersion() {
    const raw = probe('node --version');
    if (!raw)
        return null;
    return parseNodeVersion(raw);
}
// ─────────────────────────────────────────────
// Internal: platform strategies
// ─────────────────────────────────────────────
/**
 * Windows strategy: winget install OpenJS.NodeJS
 *
 * winget is available on Windows 10 1709+ / Windows 11.
 * We request the LTS package and let winget pick the latest release
 * that satisfies the version floor.
 */
async function installViaWinget() {
    logger_1.logger.info('[node:winget] Installing Node.js via winget …');
    // --accept-* flags suppress interactive prompts in automated context
    return runCommand('winget', [
        'install',
        '--id', 'OpenJS.NodeJS.LTS',
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent',
    ]);
}
/**
 * macOS strategy: brew install node@22
 *
 * Installs a specific major version formula and links it.
 * Falls back to `brew upgrade node@22` when already present but outdated.
 */
async function installViaBrew() {
    logger_1.logger.info('[node:brew] Installing Node.js via Homebrew …');
    // Check if already installed (but wrong version) → upgrade instead
    const formulaInstalled = probe('brew list --formula node@22') !== null;
    const action = formulaInstalled ? 'upgrade' : 'install';
    const installResult = await runCommand('brew', [action, `node@${NODE_TARGET_MAJOR}`]);
    if (!installResult.ok)
        return installResult;
    // `brew install node@22` is keg-only — must link explicitly
    logger_1.logger.info('[node:brew] Linking node@22 …');
    return runCommand('brew', ['link', '--overwrite', '--force', `node@${NODE_TARGET_MAJOR}`]);
}
/**
 * Linux / WSL / macOS-fallback strategy: nvm
 *
 * Steps:
 *  1. Bootstrap nvm if not present
 *  2. `nvm install 22`
 *  3. `nvm use 22` + `nvm alias default 22`
 *
 * Note: nvm modifies ~/.bashrc / ~/.zshrc but the current shell session
 * won't see it until reloaded. We inform the user via a warning.
 */
async function installViaNvm(osInfo) {
    logger_1.logger.info('[node:nvm] Setting up nvm …');
    const nvmDir = process.env['NVM_DIR'] ?? path.join(osInfo.homeDir, '.nvm');
    const nvmScript = path.join(nvmDir, 'nvm.sh');
    // ── 1. Install nvm if not present ───────────────────────────────────
    const nvmExists = probe(`bash -c "[ -f ${nvmScript} ] && echo yes"`) === 'yes';
    if (!nvmExists) {
        logger_1.logger.info(`[node:nvm] Bootstrapping nvm v${NVM_VERSION} …`);
        const bootstrapUrl = `https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh`;
        const bootstrapResult = await runCommand('bash', ['-c', `curl -o- ${bootstrapUrl} | bash`], {
            shell: false,
        });
        if (!bootstrapResult.ok)
            return bootstrapResult;
    }
    // ── 2. Install Node 22 via nvm ───────────────────────────────────────
    // We must source nvm.sh in the same bash invocation
    const nvmCmd = (subcommand) => `bash -c ". ${nvmScript} && ${subcommand}"`;
    logger_1.logger.info(`[node:nvm] nvm install ${NODE_TARGET_MAJOR} …`);
    const installResult = await runCommand('bash', [
        '-c',
        `. "${nvmScript}" && nvm install ${NODE_TARGET_MAJOR} && nvm use ${NODE_TARGET_MAJOR} && nvm alias default ${NODE_TARGET_MAJOR}`,
    ]);
    if (!installResult.ok)
        return installResult;
    // ── 3. Symlink node into a stable PATH location (optional convenience) ──
    // nvm-managed node lives in ~/.nvm/versions/node/vX.Y.Z/bin/
    // We try to detect the installed path and create a /usr/local/bin symlink.
    const nvmNodePath = probe(nvmCmd(`nvm which ${NODE_TARGET_MAJOR}`));
    if (nvmNodePath && !osInfo.isWindows) {
        probe(`ln -sf "${nvmNodePath}" /usr/local/bin/node 2>/dev/null || true`);
        const npmPath = nvmNodePath.replace(/\/node$/, '/npm');
        probe(`ln -sf "${npmPath}" /usr/local/bin/npm 2>/dev/null || true`);
    }
    return installResult;
}
// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────
/**
 * Ensure Node.js >= 22.x is installed on the user's system.
 *
 * The function:
 *  1. Probes the current Node version — returns early if already satisfied
 *  2. Selects the best install method for the detected OS
 *  3. Runs the install
 *  4. Verifies the result
 *  5. Returns a NodeInstallResult (never throws)
 *
 * @example
 * const result = await ensureNode(osInfo);
 * if (!result.success) {
 *   console.error(result.summary);
 *   process.exit(1);
 * }
 */
async function ensureNode(osInfo) {
    const warnings = [];
    // ── Step 1: Check existing version ──────────────────────────────────
    const existing = detectNodeVersion();
    if (existing?.satisfies) {
        return {
            success: true,
            method: 'already-installed',
            version: existing,
            summary: `Node.js ${existing.raw} already satisfies >= ${NODE_TARGET_MAJOR}.x - skipping install.`,
            warnings,
        };
    }
    if (existing) {
        logger_1.logger.warn(`[node] Found Node.js ${existing.raw} (major: ${existing.major}), ` +
            `needs upgrade to >= ${NODE_TARGET_MAJOR}.`);
    }
    else {
        logger_1.logger.info('[node] Node.js not found — proceeding with installation.');
    }
    // ── Step 2: Select & run install strategy ───────────────────────────
    let method;
    let cmdResult;
    if (osInfo.isWindows && !osInfo.isWsl) {
        method = 'winget';
        cmdResult = await installViaWinget();
        if (!cmdResult.ok) {
            // winget not available or failed — surface hint instead of crashing
            return {
                success: false,
                method,
                version: null,
                summary: `winget install failed (exit ${cmdResult.exitCode}). ` +
                    `Please install Node.js ${NODE_TARGET_MAJOR}.x manually from https://nodejs.org/`,
                warnings,
            };
        }
        warnings.push('Node.js was installed via winget. You may need to restart your terminal ' +
            'for the PATH change to take effect before running openspec.');
    }
    else if (osInfo.isMacos && !osInfo.isWsl) {
        method = 'brew';
        cmdResult = await installViaBrew();
        if (!cmdResult.ok) {
            // Homebrew failed — try nvm as macOS fallback
            logger_1.logger.warn('[node:brew] Homebrew install failed — falling back to nvm …');
            method = 'nvm';
            cmdResult = await installViaNvm(osInfo);
        }
        if (!cmdResult.ok) {
            return {
                success: false,
                method,
                version: null,
                summary: `Node.js installation failed (exit ${cmdResult.exitCode}). Check stderr above.`,
                warnings,
            };
        }
        if (method === 'nvm') {
            warnings.push('nvm was used to install Node.js. Run `source ~/.nvm/nvm.sh` or open a new ' +
                'terminal session for the `node` command to be available system-wide.');
        }
    }
    else {
        // Linux, WSL, or any other POSIX-like system
        method = 'nvm';
        cmdResult = await installViaNvm(osInfo);
        if (!cmdResult.ok) {
            return {
                success: false,
                method,
                version: null,
                summary: `nvm-based Node.js installation failed (exit ${cmdResult.exitCode}). Check stderr above.`,
                warnings,
            };
        }
        warnings.push('nvm was used to install Node.js. Run `source ~/.nvm/nvm.sh` or open a new ' +
            'terminal session for the `node` command to be available globally.');
    }
    // ── Step 3: Verify ──────────────────────────────────────────────────
    const installed = detectNodeVersion();
    if (!installed) {
        return {
            success: false,
            method,
            version: null,
            summary: 'Installation command succeeded but `node --version` still fails. ' +
                'The binary may not be on your current PATH. Open a new terminal and re-run.',
            warnings,
        };
    }
    if (!installed.satisfies) {
        return {
            success: false,
            method,
            version: installed,
            summary: `Installation completed but active version ${installed.raw} is still < ${NODE_TARGET_MAJOR}. ` +
                `Another Node.js installation may be shadowing the new one on PATH.`,
            warnings,
        };
    }
    return {
        success: true,
        method,
        version: installed,
        summary: `Node.js ${installed.raw} installed successfully via ${method}.`,
        warnings,
    };
}
/**
 * Pretty-print a NodeInstallResult for CLI output.
 */
function formatNodeResult(result) {
    const status = result.success ? '[ok]' : '[x]';
    const version = result.version ? ` (${result.version.raw})` : '';
    const lines = [`${status} node${version} - ${result.summary}`];
    for (const w of result.warnings) {
        lines.push(`  [warn] ${w}`);
    }
    return lines.join('\n');
}
//# sourceMappingURL=node.js.map