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
import type { OsInfo } from '../detect/os';
export type InstallMethod = 'winget' | 'brew' | 'nvm' | 'already-installed' | 'failed';
export interface NodeVersionInfo {
    /** Raw version string, e.g. "v22.3.0" */
    raw: string;
    /** Major version number */
    major: number;
    /** Whether this version satisfies >= NODE_TARGET_MAJOR */
    satisfies: boolean;
}
export interface CommandResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}
export interface NodeInstallResult {
    /** Whether Node.js >= 22 is available after this function returns */
    success: boolean;
    /** Which install path was taken */
    method: InstallMethod;
    /** Version info after install (null when detection itself fails) */
    version: NodeVersionInfo | null;
    /** Human-readable summary of what happened */
    summary: string;
    /** Non-fatal warnings (e.g. PATH reload instructions) */
    warnings: string[];
}
/**
 * Parse the output of `node --version` (e.g. "v22.3.0") into a NodeVersionInfo.
 * Returns null when the string doesn't match expected format.
 */
export declare function parseNodeVersion(raw: string): NodeVersionInfo | null;
/**
 * Detect the currently active Node.js version.
 * Returns null if node is not on PATH.
 */
export declare function detectNodeVersion(): NodeVersionInfo | null;
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
export declare function ensureNode(osInfo: OsInfo): Promise<NodeInstallResult>;
/**
 * Pretty-print a NodeInstallResult for CLI output.
 */
export declare function formatNodeResult(result: NodeInstallResult): string;
//# sourceMappingURL=node.d.ts.map