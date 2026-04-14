/**
 * os.ts — Operating System & Architecture Detection
 *
 * Responsibilities:
 *  1. Identify the OS family: windows | macos | linux
 *  2. Identify the CPU architecture: x64 | arm64
 *  3. Provide helper utilities (isWindows / isMacos / isLinux)
 *  4. Return a rich OsInfo object consumed by downstream install strategies
 *
 * Detection strategy (priority order):
 *  - process.platform  →  primary, always available in Node.js
 *  - process.arch      →  primary for arch
 *  - os.release()      →  used for supplemental version info
 */
export type OsType = 'windows' | 'macos' | 'linux';
export type Arch = 'x64' | 'arm64' | 'unsupported';
export interface OsInfo {
    /** Normalised OS family */
    type: OsType;
    /** Normalised CPU architecture */
    arch: Arch;
    /** Raw value from process.platform */
    rawPlatform: NodeJS.Platform;
    /** Raw value from process.arch */
    rawArch: string;
    /** os.release() — kernel / build version string */
    release: string;
    /** os.homedir() — user home directory */
    homeDir: string;
    /** Resolved path to ~/.claude directory */
    claudeConfigDir: string;
    /** True when running inside WSL (Windows Subsystem for Linux) */
    isWsl: boolean;
    /** Helper flags */
    isWindows: boolean;
    isMacos: boolean;
    isLinux: boolean;
}
/**
 * Detect and return full OS information.
 *
 * This function is synchronous — all inputs come from Node.js built-ins
 * and are available instantly without I/O.
 *
 * @example
 * const info = detectOs();
 * if (info.isWindows) { ... }
 */
export declare function detectOs(): OsInfo;
/**
 * Pretty-print OsInfo to a human-readable single-line summary.
 * Useful for logging at installer startup.
 *
 * @example
 * console.log(formatOsInfo(detectOs()));
 * // → "OS: macos (arm64) | release: 23.4.0 | home: /Users/alice | WSL: false"
 */
export declare function formatOsInfo(info: OsInfo): string;
/**
 * Throw a descriptive error when the detected arch is unsupported.
 * Call this at the entry point after detectOs() if you want hard enforcement.
 */
export declare function assertSupportedArch(info: OsInfo): void;
//# sourceMappingURL=os.d.ts.map