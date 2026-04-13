#Requires -Version 5.1
<#
.SYNOPSIS
    openspec-installer bootstrap script for Windows (PowerShell).

.DESCRIPTION
    One-line install — choose the fastest source for your network:

    [A] GitHub Raw（推荐）:
        irm https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.ps1 | iex

    [B] jsDelivr CDN（GitHub 自动加速，国内备选）:
        irm https://cdn.jsdelivr.net/gh/jiuanlee/openspec-installer@main/scripts/install.ps1 | iex

    [C] 本地执行（已下载脚本）:
        .\install.ps1

    With pre-supplied credentials (CI / unattended):
        $env:TAPD_API_TOKEN   = "your-tapd-token"
        .\install.ps1

    What this script does:
        1. Detects Windows version and architecture
        2. Ensures Node.js >= 22 is installed  (winget → MSI fallback)
        3. Installs openspec-installer globally via npm
        4. Runs openspec-installer (openspec + Claude Code integration)

    Supported:
        Windows 10 1709+ / Windows 11  (x64, arm64)
        PowerShell 5.1+ and PowerShell 7+

    Exit codes:
        0  success
        1  fatal error

.PARAMETER SkipNode
    Skip the Node.js installation step (assume node >= 22 is already on PATH).

.PARAMETER SkipInstaller
    Skip npm install of openspec-installer (assume it is already on PATH).

.PARAMETER NpmRegistry
    Custom npm registry URL (overrides OPENSPEC_NPM_REGISTRY env var).

.PARAMETER Force
    Pass --force to openspec-installer (re-installs existing skills / MCP config).
#>
[CmdletBinding()]
param(
    [switch]$SkipNode,
    [switch]$SkipInstaller,
    [string]$NpmRegistry = $env:OPENSPEC_NPM_REGISTRY,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Constants ─────────────────────────────────────────────────────────────────
$SCRIPT_VERSION   = '1.0.0'
$PACKAGE_NAME     = 'openspec-installer'
$NODE_MIN_MAJOR   = 22
$NODEJS_WINGET_ID = 'OpenJS.NodeJS.LTS'
$NODEJS_MSI_BASE  = "https://nodejs.org/dist/latest-v${NODE_MIN_MAJOR}.x"

# ── Log file ──────────────────────────────────────────────────────────────────
# All output (info / warn / error / command output) is tee'd to this file.
# Even if the window closes instantly the user can review the log.
$LOG_DIR  = Join-Path $env:USERPROFILE '.openspec-installer'
$LOG_FILE = Join-Path $LOG_DIR 'bootstrap.log'

function Init-Log {
    if (-not (Test-Path $LOG_DIR)) {
        New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
    }
    $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    Add-Content -Path $LOG_FILE -Value ""
    Add-Content -Path $LOG_FILE -Value ("─" * 72)
    Add-Content -Path $LOG_FILE -Value "$ts [START] openspec-installer bootstrap v$SCRIPT_VERSION"
}

function Write-Log([string]$Level, [string]$Msg) {
    $ts   = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    $line = "$ts [$($Level.ToUpper().PadRight(5))] $Msg"
    Add-Content -Path $LOG_FILE -Value $line -ErrorAction SilentlyContinue
}

# ── Colour + log helpers ──────────────────────────────────────────────────────
function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host ("── " + $Title + " ──") -ForegroundColor Cyan
    Write-Log 'INFO' "── $Title ──"
}

function Write-Info([string]$Msg) {
    Write-Host "[info]  $Msg" -ForegroundColor Cyan
    Write-Log 'INFO' $Msg
}

function Write-Ok([string]$Msg) {
    Write-Host "[ok]    $Msg" -ForegroundColor Green
    Write-Log 'OK' $Msg
}

function Write-Warn([string]$Msg) {
    Write-Host "[warn]  $Msg" -ForegroundColor Yellow
    Write-Log 'WARN' $Msg
}

function Write-Fatal([string]$Msg) {
    Write-Host ""
    Write-Host "[fatal] $Msg" -ForegroundColor Red
    Write-Host "        Log file: $LOG_FILE" -ForegroundColor DarkGray
    Write-Log 'FATAL' $Msg
    Invoke-Pause
    exit 1
}

# ── Run a command, stream output live AND write to log ───────────────────────
# Usage: Invoke-Command-Logged 'npm' @('install','--global','foo')
function Invoke-Command-Logged([string]$Exe, [string[]]$ArgList) {
    Write-Log 'RUN' "$Exe $($ArgList -join ' ')"
    $psi                        = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName               = $Exe
    $psi.Arguments              = $ArgList -join ' '
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute        = $false
    $psi.CreateNoWindow         = $false

    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi

    # Async read stdout
    $stdoutBuf = [System.Text.StringBuilder]::new()
    $proc.add_OutputDataReceived({
        param($s, $e)
        if ($null -ne $e.Data) {
            Write-Host $e.Data
            [void]$stdoutBuf.AppendLine($e.Data)
        }
    })

    # Async read stderr — shown in yellow so it's visually distinct
    $stderrBuf = [System.Text.StringBuilder]::new()
    $proc.add_ErrorDataReceived({
        param($s, $e)
        if ($null -ne $e.Data) {
            Write-Host $e.Data -ForegroundColor Yellow
            [void]$stderrBuf.AppendLine($e.Data)
        }
    })

    [void]$proc.Start()
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()
    $proc.WaitForExit()

    # Flush buffered output to log file
    if ($stdoutBuf.Length -gt 0) { Add-Content -Path $LOG_FILE -Value $stdoutBuf.ToString() -ErrorAction SilentlyContinue }
    if ($stderrBuf.Length -gt 0) { Add-Content -Path $LOG_FILE -Value ("[STDERR] " + $stderrBuf.ToString()) -ErrorAction SilentlyContinue }

    return $proc.ExitCode
}

# ── Pause — reliable across irm|iex AND double-click ─────────────────────────
# irm|iex: stdin is NOT redirected (iex evaluates a string, doesn't pipe stdin)
# Double-click / Run dialog: opens a new ConsoleHost window
# CI (& script): typically non-interactive ($Host.Name != ConsoleHost)
#
# Strategy: try ReadKey first; if that throws (non-interactive host), fall back
# to Read-Host which works in more contexts; if both fail, just return silently.
function Invoke-Pause {
    # Never pause in CI / non-interactive environments
    if (-not [Environment]::UserInteractive) { return }
    if ($Host.Name -ne 'ConsoleHost')        { return }

    Write-Host ""
    Write-Host "Log saved to: $LOG_FILE" -ForegroundColor DarkGray
    Write-Host "Press ENTER to close..." -ForegroundColor DarkGray
    try {
        # ReadKey works in real console windows
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } catch {
        try { Read-Host } catch { <# swallow — best effort #> }
    }
}

# ── Prerequisite: execution policy ───────────────────────────────────────────
function Assert-ExecutionPolicy {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -eq 'Restricted') {
        Write-Info "Setting ExecutionPolicy to RemoteSigned for CurrentUser …"
        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    }
}

# ── OS / arch detection ───────────────────────────────────────────────────────
function Get-PlatformInfo {
    $os   = [System.Environment]::OSVersion.VersionString
    $arch = if ([System.Environment]::Is64BitOperatingSystem) {
                if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
            } else {
                Write-Fatal "32-bit Windows is not supported."
            }
    Write-Info "Platform: Windows ($arch) | $os"
    return $arch
}

# ── Command check ─────────────────────────────────────────────────────────────
function Test-Command([string]$Cmd) {
    return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

# ── Node.js version check ─────────────────────────────────────────────────────
function Get-NodeMajor {
    if (-not (Test-Command 'node')) { return 0 }
    try {
        $raw = & node --version 2>$null
        if ($raw -match 'v(\d+)') { return [int]$Matches[1] }
    } catch {}
    return 0
}

function Test-NodeSatisfies {
    return (Get-NodeMajor) -ge $NODE_MIN_MAJOR
}

# ── winget install ────────────────────────────────────────────────────────────
function Install-NodeViaWinget {
    Write-Info "Installing Node.js $NODE_MIN_MAJOR via winget …"
    $wingetArgs = @(
        'install', '--id', $NODEJS_WINGET_ID,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent'
    )
    $code = Invoke-Command-Logged 'winget' $wingetArgs
    if ($code -ne 0) { return $false }
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    return $true
}

# ── MSI fallback ─────────────────────────────────────────────────────────────
function Install-NodeViaMsi([string]$Arch) {
    Write-Info "Downloading Node.js $NODE_MIN_MAJOR MSI installer …"
    $msiArch  = if ($Arch -eq 'arm64') { 'arm64' } else { 'x64' }
    $indexUrl = "$NODEJS_MSI_BASE/SHASUMS256.txt"
    try {
        $index   = Invoke-WebRequest -Uri $indexUrl -UseBasicParsing -ErrorAction Stop
        $msiLine = ($index.Content -split "`n") | Where-Object { $_ -match "node-v[\d.]+-${msiArch}\.msi" } | Select-Object -First 1
        $msiFile = ($msiLine -split '\s+')[1].Trim()
        $msiUrl  = "$NODEJS_MSI_BASE/$msiFile"
    } catch {
        Write-Fatal "Could not fetch Node.js download index: $_"
    }

    $tmpMsi = Join-Path $env:TEMP "node-installer.msi"
    Write-Info "Downloading: $msiUrl"
    try {
        Invoke-WebRequest -Uri $msiUrl -OutFile $tmpMsi -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Fatal "MSI download failed: $_"
    }

    Write-Info "Running MSI installer (silent) …"
    $result = Start-Process 'msiexec.exe' -ArgumentList "/i `"$tmpMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
    Remove-Item $tmpMsi -ErrorAction SilentlyContinue

    if ($result.ExitCode -ne 0 -and $result.ExitCode -ne 3010) {
        Write-Fatal "MSI installation failed with exit code $($result.ExitCode)."
    }

    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')

    if ($result.ExitCode -eq 3010) {
        Write-Warn "A system restart is required to complete Node.js installation."
        Write-Warn "After restarting, re-run this script to continue."
        Invoke-Pause
        exit 0
    }
}

# ── Node.js orchestrator ──────────────────────────────────────────────────────
function Invoke-EnsureNode([string]$Arch) {
    Write-Section "Node.js >= $NODE_MIN_MAJOR"

    if (Test-NodeSatisfies) {
        $ver = & node --version
        Write-Ok "Node.js $ver already satisfies >= $NODE_MIN_MAJOR — skipping."
        return
    }

    $current = Get-NodeMajor
    if ($current -gt 0) {
        Write-Warn "Node.js v$current found, needs upgrade to >= $NODE_MIN_MAJOR."
    } else {
        Write-Info "Node.js not found — installing …"
    }

    $wingetOk = $false
    if (Test-Command 'winget') {
        $wingetOk = Install-NodeViaWinget
        if (-not $wingetOk) { Write-Warn "winget install failed — falling back to MSI download." }
    } else {
        Write-Warn "winget not available — falling back to MSI download."
    }

    if (-not $wingetOk) { Install-NodeViaMsi -Arch $Arch }

    if (-not (Test-NodeSatisfies)) {
        Write-Warn "Node.js installed but 'node' not yet on PATH in this session."
        Write-Warn "Please open a new PowerShell window and re-run this script."
        Invoke-Pause
        exit 0
    }

    Write-Ok "Node.js $(& node --version) ready."
    Write-Warn "Note: You may need to restart your terminal for PATH changes to persist."
}

# ── openspec-installer npm install ────────────────────────────────────────────
function Invoke-InstallPackage {
    Write-Section "Installing $PACKAGE_NAME"

    if (-not (Test-Command 'npm')) {
        Write-Fatal "'npm' not found on PATH. Ensure Node.js is installed and restart your terminal."
    }

    $npmArgs = @('install', '--global', $PACKAGE_NAME, '--no-fund', '--no-audit')
    $registry = if ($NpmRegistry) { $NpmRegistry } else { $env:OPENSPEC_NPM_REGISTRY }
    if ($registry) {
        Write-Info "Using custom registry: $registry"
        $npmArgs += @('--registry', $registry)
    }

    Write-Info "Running: npm $($npmArgs -join ' ') …"
    $exitCode = Invoke-Command-Logged 'npm' $npmArgs

    if ($exitCode -ne 0) {
        Write-Fatal "npm install failed (exit $exitCode). See log for full output: $LOG_FILE"
    }

    if (-not (Test-Command $PACKAGE_NAME)) {
        $globalBin = & npm bin -g 2>$null
        Write-Warn "$PACKAGE_NAME installed but not found on PATH."
        if ($globalBin) { Write-Warn "Add '$globalBin' to your PATH, then re-run." }
        Write-Fatal "Cannot continue — $PACKAGE_NAME is not executable."
    }

    Write-Ok "$PACKAGE_NAME installed successfully."
}

# ── Run openspec-installer ────────────────────────────────────────────────────
function Invoke-Installer {
    Write-Section "Running $PACKAGE_NAME"

    $installerArgs = @()
    if ($Force) { $installerArgs += '--force' }

    Write-Info "Command: $PACKAGE_NAME $($installerArgs -join ' ')"
    $exitCode = Invoke-Command-Logged $PACKAGE_NAME $installerArgs

    if ($exitCode -ne 0) {
        Write-Fatal "$PACKAGE_NAME exited with code $exitCode. See log: $LOG_FILE"
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
function Write-Summary {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║            Setup Complete!               ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Run " -NoNewline
    Write-Host "openspec --help" -ForegroundColor Cyan -NoNewline
    Write-Host " to get started."
    Write-Host ""
    Write-Log 'OK' "Setup complete."
}

# ── Main ──────────────────────────────────────────────────────────────────────
function Main {
    Init-Log

    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  openspec-installer bootstrap v$SCRIPT_VERSION    ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
    Write-Info "Log file: $LOG_FILE"

    Assert-ExecutionPolicy
    $arch = Get-PlatformInfo

    if (-not $SkipNode)      { Invoke-EnsureNode -Arch $arch }
    if (-not $SkipInstaller) { Invoke-InstallPackage }

    Invoke-Installer
    Write-Summary
    Invoke-Pause
}

Main
