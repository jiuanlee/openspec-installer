#Requires -Version 5.1
<#
.SYNOPSIS
    openspec-installer bootstrap script for Windows (PowerShell) - GitLab version.

.DESCRIPTION
    One-line install:

    [A] GitLab Raw (Company Internal):
        irm https://gitlab.gaodun.com/strom/openspec-installer/-/raw/master/scripts/install.ps1 | iex

    [B] Local:
        .\install.ps1

.PARAMETER SkipNode
    Skip the Node.js installation step (assume node >= 18 is already on PATH).

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

# -- Constants ---------------------------------------------------------------
$SCRIPT_VERSION   = '1.0.0'
$PACKAGE_NAME     = 'openspec-installer'
$NODE_MIN_MAJOR   = 18   # Claude Code requires Node.js >= 18
$NODEJS_WINGET_ID = 'OpenJS.NodeJS.LTS'
$NODEJS_MSI_BASE  = "https://nodejs.org/dist/latest-v${NODE_MIN_MAJOR}.x"

# -- Log file ----------------------------------------------------------------
$LOG_DIR  = Join-Path $env:USERPROFILE '.openspec-installer'
$LOG_FILE = Join-Path $LOG_DIR 'bootstrap.log'

function Init-Log {
    if (-not (Test-Path $LOG_DIR)) {
        New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null
    }
    $ts = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    [System.IO.File]::AppendAllText($LOG_FILE, "", [System.Text.Encoding]::UTF8)
    [System.IO.File]::AppendAllText($LOG_FILE, ("-" * 72) + "`r`n", [System.Text.Encoding]::UTF8)
    [System.IO.File]::AppendAllText($LOG_FILE, "$ts [START] openspec-installer bootstrap v$SCRIPT_VERSION`r`n", [System.Text.Encoding]::UTF8)
}

function Write-Log([string]$Level, [string]$Msg) {
    $ts   = Get-Date -Format 'yyyy-MM-ddTHH:mm:ss'
    $line = "$ts [$($Level.ToUpper().PadRight(5))] $Msg`r`n"
    [System.IO.File]::AppendAllText($LOG_FILE, $line, [System.Text.Encoding]::UTF8)
}

# -- Colour + log helpers -----------------------------------------------------
function Write-Section([string]$Title) {
    Write-Host ""
    Write-Host "-- $Title --" -ForegroundColor Cyan
    Write-Log 'INFO' "-- $Title --"
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

# -- Run a command, stream output live AND write to log ----------------------
function Invoke-Command-Logged([string]$Exe, [string[]]$ArgList) {
    Write-Log 'RUN' "$Exe $($ArgList -join ' ')"

    $resolvedPath = $Exe
    $cmdInfo = Get-Command $Exe -ErrorAction SilentlyContinue
    if ($cmdInfo) {
        $resolvedPath = $cmdInfo.Source
        Write-Log 'DEBUG' "Resolved '$Exe' to '$resolvedPath'"
    } else {
        Write-Warn "Cannot find command '$Exe' on PATH"
        Write-Log 'FATAL' "Cannot find command '$Exe' on PATH"
        return -1
    }

    Write-Info "Executing: $Exe $($ArgList -join ' ') ..."

    try {
        $output = & $resolvedPath @ArgList 2>&1 | ForEach-Object {
            $line = $_.ToString()
            Write-Host $line
            $line
        }
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) { $exitCode = 0 }
    } catch {
        Write-Warn "Command threw exception: $_"
        Write-Log 'ERROR' "Command exception: $_"
        $output = $_.ToString()
        $exitCode = 1
    }

    if ($output) {
        $logText = ($output -join "`r`n") + "`r`n"
        [System.IO.File]::AppendAllText($LOG_FILE, $logText, [System.Text.Encoding]::UTF8)
    }

    Write-Log 'DEBUG' "Exit code: $exitCode"
    return $exitCode
}

# -- Pause --------------------------------------------------------------------
function Invoke-Pause {
    if (-not [Environment]::UserInteractive) { return }
    if ($Host.Name -ne 'ConsoleHost')        { return }

    Write-Host ""
    Write-Host "Log saved to: $LOG_FILE" -ForegroundColor DarkGray
    Write-Host "Press ENTER to close..." -ForegroundColor DarkGray
    try {
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    } catch {
        try { Read-Host } catch {}
    }
}

# -- Prerequisite: execution policy ------------------------------------------
function Assert-ExecutionPolicy {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -eq 'Restricted') {
        Write-Info "Setting ExecutionPolicy to RemoteSigned for CurrentUser..."
        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
    }
}

# -- OS / arch detection ------------------------------------------------------
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

# -- Command check ------------------------------------------------------------
function Test-Command([string]$Cmd) {
    return [bool](Get-Command $Cmd -ErrorAction SilentlyContinue)
}

# -- Node.js version check ----------------------------------------------------
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

# -- winget install -----------------------------------------------------------
function Install-NodeViaWinget {
    Write-Info "Installing Node.js $NODE_MIN_MAJOR via winget..."
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

# -- MSI fallback ------------------------------------------------------------
function Install-NodeViaMsi([string]$Arch) {
    Write-Info "Downloading Node.js $NODE_MIN_MAJOR MSI installer..."

    # -- Uninstall existing Node.js first to avoid version conflict (exit 1603) --
    $existingNode = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
                    Where-Object { $_.DisplayName -match "Node.js" }
    if ($existingNode) {
        Write-Info "Found existing Node.js installation - attempting uninstall..."
        $uninstallCmd = $existingNode.UninstallString
        if ($uninstallCmd) {
            $result = Start-Process 'msiexec.exe' -ArgumentList "/x $($existingNode.UninstallString -replace 'MsiExec\.exe\s+','') /quiet /norestart" -Wait -PassThru -ErrorAction SilentlyContinue
            if ($result.ExitCode -eq 0 -or $result.ExitCode -eq 1605 -or $result.ExitCode -eq 3010) {
                Write-Info "Old Node.js uninstalled successfully."
                if ($result.ExitCode -eq 3010) {
                    Write-Warn "A restart may be needed. Continuing anyway..."
                }
            } else {
                Write-Warn "Uninstall failed (exit $($result.ExitCode)). Will try installing anyway..."
            }
        }
    }

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

    Write-Info "Running MSI installer (silent)..."
    $result = Start-Process 'msiexec.exe' -ArgumentList "/i `"$tmpMsi`" /quiet /norestart ADDLOCAL=ALL" -Wait -PassThru
    Remove-Item $tmpMsi -ErrorAction SilentlyContinue

    if ($result.ExitCode -ne 0 -and $result.ExitCode -ne 3010) {
        Write-Fatal "MSI installation failed with exit code $($result.ExitCode).`n" +
                    "This often happens when an older Node.js version is installed.`n" +
                    "Please manually uninstall Node.js from Control Panel and re-run this script."
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

# -- Node.js orchestrator -----------------------------------------------------
function Invoke-EnsureNode([string]$Arch) {
    Write-Section "Node.js >= $NODE_MIN_MAJOR"

    if (Test-NodeSatisfies) {
        $ver = & node --version
        Write-Ok "Node.js $ver already satisfies >= $NODE_MIN_MAJOR - skipping."
        return
    }

    $current = Get-NodeMajor
    if ($current -gt 0) {
        Write-Warn "Node.js v$current found, needs upgrade to >= $NODE_MIN_MAJOR."
    } else {
        Write-Info "Node.js not found - installing..."
    }

    $wingetOk = $false
    if (Test-Command 'winget') {
        $wingetOk = Install-NodeViaWinget
        if (-not $wingetOk) { Write-Warn "winget install failed - falling back to MSI download." }
    } else {
        Write-Warn "winget not available - falling back to MSI download."
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

# -- openspec-installer npm install ------------------------------------------
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

    Write-Info "Running: npm $($npmArgs -join ' ') ..."
    $exitCode = Invoke-Command-Logged 'npm' $npmArgs

    if ($exitCode -ne 0) {
        Write-Fatal "npm install failed (exit $exitCode). See log for full output: $LOG_FILE"
    }

    if (-not (Test-Command $PACKAGE_NAME)) {
        $globalBin = & npm bin -g 2>$null
        Write-Warn "$PACKAGE_NAME installed but not found on PATH."
        if ($globalBin) { Write-Warn "Add '$globalBin' to your PATH, then re-run." }
        Write-Fatal "Cannot continue - $PACKAGE_NAME is not executable."
    }

    Write-Ok "$PACKAGE_NAME installed successfully."
}

# -- Run openspec-installer ---------------------------------------------------
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

# -- Summary ------------------------------------------------------------------
function Write-Summary {
    Write-Host ""
    Write-Host "+==========================================+" -ForegroundColor Green
    Write-Host "|            Setup Complete!               |" -ForegroundColor Green
    Write-Host "+==========================================+" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Run " -NoNewline
    Write-Host "openspec --help" -ForegroundColor Cyan -NoNewline
    Write-Host " to get started."
    Write-Host ""
    Write-Log 'OK' "Setup complete."
}

# -- Main ---------------------------------------------------------------------
function Main {
    Init-Log

    Write-Host ""
    Write-Host "+==========================================+" -ForegroundColor Cyan
    Write-Host "|  openspec-installer bootstrap v$SCRIPT_VERSION    |" -ForegroundColor Cyan
    Write-Host "+==========================================+" -ForegroundColor Cyan
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

try {
    Main
} catch {
    Write-Host ""
    Write-Host "[fatal] Unexpected error: $_" -ForegroundColor Red
    Write-Host "        $($_.ScriptStackTrace)" -ForegroundColor DarkGray
    Write-Log 'FATAL' "Unexpected error: $_"
    Write-Log 'FATAL' $_.ScriptStackTrace
    Invoke-Pause
    exit 1
}
