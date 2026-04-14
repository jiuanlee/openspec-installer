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
import type { OsInfo } from '../detect/os';
export interface OpenspecVersionInfo {
    /** Raw version string as reported by `openspec --version`, e.g. "0.5.2" */
    raw: string;
}
export interface OpenspecInstallOptions {
    /**
     * Custom npm registry URL.
     * When provided, passed as `--registry <url>` to npm.
     * Useful for enterprise or air-gapped environments.
     * @default undefined (uses default npm registry)
     */
    registry?: string;
    /**
     * Force reinstall even if openspec is already present.
     * @default false
     */
    force?: boolean;
}
export type OpenspecInstallStatus = 'already-installed' | 'installed' | 'upgraded' | 'failed';
export interface OpenspecInstallResult {
    success: boolean;
    status: OpenspecInstallStatus;
    /** Version found after the operation (null when verification fails) */
    version: OpenspecVersionInfo | null;
    /** Version that was present before the operation, if any */
    previousVersion: OpenspecVersionInfo | null;
    /** Human-readable summary */
    summary: string;
    /** Non-fatal warnings */
    warnings: string[];
}
/**
 * Detect the currently installed openspec version.
 * Returns null if openspec is not on PATH.
 */
export declare function detectOpenspecVersion(): OpenspecVersionInfo | null;
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
export declare function ensureOpenspec(osInfo: OsInfo, opts?: OpenspecInstallOptions): Promise<OpenspecInstallResult>;
/**
 * Pretty-print an OpenspecInstallResult for CLI output.
 */
export declare function formatOpenspecResult(result: OpenspecInstallResult): string;
//# sourceMappingURL=openspec.d.ts.map