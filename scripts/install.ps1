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
        $env:CONF_BASE_URL    = "https://confluence.example.com"
        $env:CONF_TOKEN       = "your-confluence-token"
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
# Official Node.js MSI download base (fallback when winget is unavailable)
$NODEJS_MSI_BASE  = "https://nodejs.org/dist/latest-v${NODE_MIN_MAJOR}.x"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host ("── " + $Title + " ──") -ForegroundColor Cyan
}

function Write-Info([string]$Msg)    { Write-Host "[info]  $Msg" -ForegroundColor Cyan }
function Write-Ok([string]$Msg)      { Write-Host "[ok]    $Msg" -ForegroundColor Green }
function Write-Warn([string]$Msg)    { Write-Host "[warn]  $Msg" -ForegroundColor Yellow }
function Write-Fatal([string]$Msg)   {
    Write-Host "[fatal] $Msg" -ForegroundColor Red
    Invoke-Pause
    exit 1
}

# ── Pause helper — only when window will close after script ends ──────────────
#
# Detection logic:
#   $Host.Name -eq 'ConsoleHost'  → running in a real powershell.exe window
#   $Host.UI.RawUI.WindowTitle    → present only in interactive window sessions
#   [Environment]::UserInteractive → false in pure pipe / CI contexts
#
# When invoked as `irm ... | iex`, the script runs inside the CALLER's shell,
# so $Host.Name is 'ConsoleHost' but the window belongs to the parent process.
# The safest proxy: check whether stdin is connected to a console (not a pipe).
function Invoke-Pause {
    $isInteractive = [Environment]::UserInteractive -and
                     $Host.Name -eq 'ConsoleHost' -and
                     -not ([Console]::IsInputRedirected)
    if ($isInteractive) {
        Write-Host ""
        Write-Host "Press any key to close this window..." -ForegroundColor DarkGray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    }
}


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
    $args = @(
        'install', '--id', $NODEJS_WINGET_ID,
        '--exact',
        '--accept-package-agreements',
        '--accept-source-agreements',
        '--silent'
    )
    $result = Start-Process 'winget' -ArgumentList $args -Wait -PassThru -NoNewWindow
    if ($result.ExitCode -ne 0) {
        return $false
    }
    # Refresh PATH in this session
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')
    return $true
}

# ── MSI fallback ─────────────────────────────────────────────────────────────
function Install-NodeViaMsi([string]$Arch) {
    Write-Info "Downloading Node.js $NODE_MIN_MAJOR MSI installer …"

    # Determine MSI filename based on arch
    $msiArch = if ($Arch -eq 'arm64') { 'arm64' } else { 'x64' }

    # Fetch the latest patch version from the index
    $indexUrl = "$NODEJS_MSI_BASE/SHASUMS256.txt"
    try {
        $index    = Invoke-WebRequest -Uri $indexUrl -UseBasicParsing -ErrorAction Stop
        $msiLine  = ($index.Content -split "`n") | Where-Object { $_ -match "node-v[\d.]+-${msiArch}\.msi" } | Select-Object -First 1
        $msiFile  = ($msiLine -split '\s+')[1].Trim()
        $msiUrl   = "$NODEJS_MSI_BASE/$msiFile"
    } catch {
        Write-Fatal "Could not fetch Node.js download index from $NODEJS_MSI_BASE. Check your internet connection."
    }

    $tmpMsi = Join-Path $env:TEMP "node-installer.msi"
    Write-Info "Downloading: $msiUrl"
    try {
        Invoke-WebRequest -Uri $msiUrl -OutFile $tmpMsi -UseBasicParsing -ErrorAction Stop
    } catch {
        Write-Fatal "MSI download failed: $_"
    }

    Write-Info "Running MSI installer (silent) …"
    $result = Start-Process 'msiexec.exe' -ArgumentList "/i `"$tmpMsi`" /quiet /norestart ADDLOCAL=ALL" `
                            -Wait -PassThru
    Remove-Item $tmpMsi -ErrorAction SilentlyContinue

    if ($result.ExitCode -ne 0 -and $result.ExitCode -ne 3010) {
        Write-Fatal "MSI installation failed with exit code $($result.ExitCode)."
    }

    # Refresh PATH
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH', 'User')

    if ($result.ExitCode -eq 3010) {
        Write-Warn "A system restart is required to complete Node.js installation."
        Write-Warn "After restarting, re-run this script to continue."
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

    # Try winget first (available on Windows 10 1709+ / Windows 11)
    $wingetOk = $false
    if (Test-Command 'winget') {
        $wingetOk = Install-NodeViaWinget
        if (-not $wingetOk) {
            Write-Warn "winget install failed — falling back to MSI download."
        }
    } else {
        Write-Warn "winget not available — falling back to MSI download."
    }

    if (-not $wingetOk) {
        Install-NodeViaMsi -Arch $Arch
    }

    # Final check (PATH may have been updated above)
    if (-not (Test-NodeSatisfies)) {
        Write-Warn "Node.js installed but 'node' not yet on PATH in this session."
        Write-Warn "Please open a new PowerShell window and re-run this script."
        exit 0
    }

    Write-Ok "Node.js $(& node --version) ready."
    Write-Warn "Note: You may need to restart your terminal for PATH changes to persist."
}

# ── openspec-installer npm install ────────────────────────────────────────────
function Invoke-InstallPackage {
    Write-Section "Installing $PACKAGE_NAME"

    if (-not (Test-Command 'npm')) {
        Write-Fatal "'npm' not found on PATH. Ensure Node.js installed correctly and restart your terminal."
    }

    $npmArgs = @('install', '--global', $PACKAGE_NAME, '--no-fund', '--no-audit')

    $registry = if ($NpmRegistry) { $NpmRegistry } else { $env:OPENSPEC_NPM_REGISTRY }
    if ($registry) {
        Write-Info "Using custom registry: $registry"
        $npmArgs += @('--registry', $registry)
    }

    Write-Info "Running: npm $($npmArgs -join ' ') …"
    & npm @npmArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Fatal "npm install failed (exit $LASTEXITCODE). Check the output above."
    }

    if (-not (Test-Command $PACKAGE_NAME)) {
        $globalBin = & npm bin -g 2>$null
        Write-Warn "$PACKAGE_NAME installed but not on PATH."
        if ($globalBin) {
            Write-Warn "Add '$globalBin' to your PATH, then re-run."
        }
        Write-Fatal "Cannot continue — $PACKAGE_NAME is not executable."
    }

    Write-Ok "$PACKAGE_NAME installed successfully."
}

# ── Run openspec-installer ────────────────────────────────────────────────────
function Invoke-Installer {
    Write-Section "Running $PACKAGE_NAME"
    Write-Info "Forwarding environment variables to installer …"

    $installerArgs = @()
    if ($Force) { $installerArgs += '--force' }

    & $PACKAGE_NAME @installerArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Fatal "$PACKAGE_NAME exited with code $LASTEXITCODE."
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
}

# ── Main ──────────────────────────────────────────────────────────────────────
function Main {
    Write-Host ""
    Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║  openspec-installer bootstrap v$SCRIPT_VERSION    ║" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    Assert-ExecutionPolicy
    $arch = Get-PlatformInfo

    if (-not $SkipNode)      { Invoke-EnsureNode -Arch $arch }
    if (-not $SkipInstaller) { Invoke-InstallPackage }

    Invoke-Installer
    Write-Summary
    Invoke-Pause
}

Main
