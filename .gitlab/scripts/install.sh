#!/usr/bin/env bash
# =============================================================================
#  install.sh — openspec-installer bootstrap (macOS / Linux / WSL) - GitLab version
#
#  One-line install:
#
#  [A] GitLab Raw (Company Internal):
#    curl -fsSL https://gitlab.gaodun.com/strom/openspec-installer/-/raw/master/scripts/install.sh | bash
#
#  [B] npm registry (enterprise internal):
#    OPENSPEC_NPM_REGISTRY=https://npm.your-company.com bash install.sh
#
#  [C] Local execution:
#    bash scripts/install.sh
#
#  Or with env vars pre-supplied (CI / unattended):
#    TAPD_API_TOKEN=xxx bash install.sh
#
#  What this script does:
#    1. Detects OS and architecture
#    2. Ensures Node.js >= 18 is available (via nvm / brew / system package)
#    3. Installs openspec-installer globally via npm
#    4. Runs openspec-installer (which handles openspec + Claude Code integration)
#
#  Supported platforms:
#    macOS  (x64, arm64)
#    Linux  (x64, arm64) — Debian/Ubuntu/RHEL/Alpine
#    WSL    (Windows Subsystem for Linux)
#
#  Required tools (auto-installed if missing):
#    curl or wget, bash >= 3.2
#
#  Exit codes:
#    0  success
#    1  fatal error (see logs)
# =============================================================================

set -euo pipefail

# -- Configuration -----------------------------------------------------------
readonly PACKAGE_NAME="openspec-installer"
readonly NODE_MIN_MAJOR=18
readonly NVM_VERSION="0.39.7"
readonly NVM_INSTALL_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh"
readonly SCRIPT_VERSION="1.0.0"

# -- Log file ----------------------------------------------------------------
readonly LOG_DIR="${HOME}/.openspec-installer"
readonly LOG_FILE="${LOG_DIR}/bootstrap.log"

# -- Initialize log file -----------------------------------------------------
init_log() {
  mkdir -p "$LOG_DIR" 2>/dev/null || true
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%S")
  {
    echo ""
    echo "------------------------------------------------------------------------"
    echo "$ts [START] openspec-installer bootstrap v$SCRIPT_VERSION"
  } >> "$LOG_FILE"
}

# -- Write to log and console ------------------------------------------------
write_log() {
  local level="$1"; shift
  local msg="$*"
  local ts; ts=$(date -u +"%Y-%m-%dT%H:%M:%S")
  echo "$ts [$level] $msg" >> "$LOG_FILE"
}

# -- Output helpers (ASCII only - Windows terminal compatible) ---------------
info() {
  local msg="[info]  $*"
  echo "$msg"
  write_log "INFO" "$*"
}

warn() {
  local msg="[warn]  $*"
  echo -e "\033[33m$msg\033[0m"
  write_log "WARN" "$*"
}

fatal() {
  local msg="[fatal] $*"
  echo -e "\033[31m$msg\033[0m" >&2
  write_log "FATAL" "$*"
  echo ""
  echo "Log saved to: $LOG_FILE"
  echo "Press ENTER to close..."
  read -r || true
  exit 1
}

section() {
  echo ""
  echo "-- $* --"
}

ok() {
  echo -e "\033[32m[ok]\033[0m $*"
  write_log "OK" "$*"
}

# -- Detect platform ---------------------------------------------------------
get_os_type() {
  local os
  os=$(uname -s | tr '[:upper:]' '[:lower:]')
  case "$os" in
    darwin*)     echo "macos" ;;
    linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        echo "wsl"
      else
        echo "linux"
      fi
      ;;
    *)           echo "unknown" ;;
  esac
}

get_arch() {
  local arch
  arch=$(uname -m)
  case "$arch" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)             echo "$arch" ;;
  esac
}

# -- Node.js detection -------------------------------------------------------
get_node_major() {
  if command -v node >/dev/null 2>&1; then
    node --version 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'
  else
    echo ""
  fi
}

node_satisfies() {
  local major
  major=$(get_node_major)
  if [ -z "$major" ]; then
    return 1
  fi
  [ "$major" -ge "$NODE_MIN_MAJOR" ]
}

# -- nvm installation --------------------------------------------------------
install_nvm() {
  info "Installing nvm v$NVM_VERSION..."

  export NVM_DIR="$HOME/.nvm"
  curl -fsSL "$NVM_INSTALL_URL" | bash

  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    ok "nvm installed successfully."
    return 0
  else
    warn "nvm installation may have failed."
    return 1
  fi
}

# -- Install Node.js via nvm -------------------------------------------------
install_node_nvm() {
  info "Installing Node.js via nvm..."

  export NVM_DIR="$HOME/.nvm"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
  fi

  nvm install "$NODE_MIN_MAJOR"
  nvm use "$NODE_MIN_MAJOR"
  nvm alias default "$NODE_MIN_MAJOR"

  if command -v node >/dev/null 2>&1; then
    local version
    version=$(node --version)
    ok "Node.js $version installed via nvm."
    return 0
  else
    warn "Node.js installation via nvm may have failed."
    return 1
  fi
}

# -- Install Node.js via Homebrew (macOS) ------------------------------------
install_node_brew() {
  info "Installing Node.js via Homebrew..."

  if ! command -v brew >/dev/null 2>&1; then
    warn "Homebrew not found. Installing Node.js via nvm instead..."
    install_nvm
    install_node_nvm
    return $?
  fi

  brew install node@"$NODE_MIN_MAJOR"
  brew link --overwrite --force node@"$NODE_MIN_MAJOR"

  if command -v node >/dev/null 2>&1; then
    local version
    version=$(node --version)
    ok "Node.js $version installed via Homebrew."
    return 0
  else
    warn "Node.js installation via Homebrew may have failed."
    return 1
  fi
}

# -- Install Node.js via package manager (Linux) -----------------------------
install_node_linux() {
  info "Installing Node.js via system package manager..."

  if [ -f /etc/debian_version ] || [ -f /etc/lsb-release ]; then
    info "Detected Debian/Ubuntu - using apt..."
    apt-get update -qq
    apt-get install -y nodejs npm
  elif [ -f /etc/redhat-release ] || [ -f /etc/centos-release ]; then
    info "Detected RHEL/CentOS - using yum/dnf..."
    if command -v dnf >/dev/null 2>&1; then
      dnf install -y nodejs npm
    else
      yum install -y nodejs npm
    fi
  else
    warn "Unknown Linux distribution - falling back to nvm..."
    install_nvm
    install_node_nvm
    return $?
  fi

  if command -v node >/dev/null 2>&1; then
    local version
    version=$(node --version)
    ok "Node.js $version installed via system package."
    return 0
  else
    warn "Node.js installation via system package may have failed."
    return 1
  fi
}

# -- Ensure Node.js is installed ---------------------------------------------
ensure_node() {
  section "Node.js >= $NODE_MIN_MAJOR"

  if node_satisfies; then
    local ver
    ver=$(node --version)
    ok "Node.js $ver already satisfies >= $NODE_MIN_MAJOR - skipping."
    return 0
  fi

  local current
  current=$(get_node_major)
  if [ -n "$current" ]; then
    warn "Node.js v$current found, needs upgrade to >= $NODE_MIN_MAJOR."
  else
    warn "Node.js not found on PATH."
  fi

  local os_type
  os_type=$(get_os_type)

  case "$os_type" in
    macos)
      install_node_brew
      ;;
    linux|wsl)
      install_nvm
      install_node_nvm
      ;;
    *)
      fatal "Unsupported OS: $os_type"
      ;;
  esac

  if node_satisfies; then
    local ver
    ver=$(node --version)
    ok "Node.js $ver installed successfully."
    return 0
  else
    fatal "Node.js installation failed."
  fi
}

# -- Ensure openspec-installer is installed ----------------------------------
ensure_installer() {
  section "Installing openspec-installer"

  if ! command -v npm >/dev/null 2>&1; then
    fatal "npm not found. Please install Node.js first."
  fi

  local npm_version
  npm_version=$(npm --version)
  ok "npm version: $npmVersion"

  local install_args=("install" "--global" "$PACKAGE_NAME" "--no-fund" "--no-audit")

  if [ -n "${OPENSPEC_NPM_REGISTRY:-}" ]; then
    info "Using custom npm registry: $OPENSPEC_NPM_REGISTRY"
    install_args+=("--registry" "$OPENSPEC_NPM_REGISTRY")
  fi

  if ! "${install_args[@]}" 2>&1 | tee -a "$LOG_FILE"; then
    fatal "npm install failed."
  fi

  ok "$PACKAGE_NAME installed."
  return 0
}

# -- Run openspec-installer --------------------------------------------------
run_installer() {
  section "Running openspec-installer"

  if ! command -v openspec-installer >/dev/null 2>&1; then
    fatal "openspec-installer not found on PATH after install."
  fi

  local args=()
  if [ "${FORCE:-0}" = "1" ]; then
    args+=("--force")
  fi

  if ! openspec-installer "${args[@]}" 2>&1 | tee -a "$LOG_FILE"; then
    fatal "openspec-installer failed."
  fi

  return 0
}

# -- Main --------------------------------------------------------------------
main() {
  echo "+==========================================+"
  echo "|  openspec-installer bootstrap  v$SCRIPT_VERSION  |"
  echo "+==========================================+"
  echo ""

  init_log
  info "Log file: $LOG_FILE"
  write_log "INFO" "Bootstrap started - version $SCRIPT_VERSION"

  local os_type arch
  os_type=$(get_os_type)
  arch=$(get_arch)

  info "Platform: $os_type ($arch) | $(uname -a)"
  write_log "INFO" "Platform: $os_type ($arch)"

  # Phase 1: Node.js
  if [ "${SKIP_NODE:-0}" = "1" ]; then
    info "--skip-node: skipping Node.js check."
  else
    if ! ensure_node; then
      fatal "Node.js installation failed."
    fi
  fi

  # Phase 2: openspec-installer
  if [ "${SKIP_INSTALLER:-0}" = "1" ]; then
    info "--skip-installer: skipping npm install."
  else
    if ! ensure_installer; then
      fatal "openspec-installer installation failed."
    fi
  fi

  # Phase 3: Run openspec-installer
  if ! run_installer; then
    fatal "openspec-installer execution failed."
  fi

  echo ""
  echo "+==========================================+"
  echo "|            Setup Complete!               |"
  echo "+==========================================+"
  echo ""
  echo "  Run openspec --help to get started."
  echo ""
  echo "Log saved to: $LOG_FILE"
}

# -- Entry -------------------------------------------------------------------
main "$@"
