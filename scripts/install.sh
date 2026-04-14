#!/usr/bin/env bash
# =============================================================================
#  install.sh — openspec-installer bootstrap (macOS / Linux / WSL)
#
#  One-line install (choose the fastest source for your network):
#
#  [A] GitHub Raw（推荐）:
#    curl -fsSL https://raw.githubusercontent.com/jiuanlee/openspec-installer/main/scripts/install.sh | bash
#
#  [B] jsDelivr CDN（GitHub 自动加速，国内备选）:
#    curl -fsSL https://cdn.jsdelivr.net/gh/jiuanlee/openspec-installer@main/scripts/install.sh | bash
#
#  [C] npm 私有 registry（企业内网）:
#    OPENSPEC_NPM_REGISTRY=https://npm.your-company.com bash install.sh
#
#  [D] 本地执行（已下载脚本）:
#    bash scripts/install.sh
#
#  Or with env vars pre-supplied (CI / unattended):
#    TAPD_API_TOKEN=xxx \
#    CONF_BASE_URL=https://confluence.example.com \
#    CONF_TOKEN=yyy \
#    bash install.sh
#
#  What this script does:
#    1. Detects OS and architecture
#    2. Ensures Node.js >= 22 is available (via nvm / brew / system package)
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
#    1  fatal error (unsupported OS, network failure, etc.)
# =============================================================================

set -euo pipefail

# ─── Constants ────────────────────────────────────────────────────────────────
readonly PACKAGE_NAME="openspec-installer"
readonly PACKAGE_SOURCE="github:jiuanlee/openspec-installer"  # 直接从 GitHub 安装
readonly NODE_MIN_MAJOR=22
readonly NVM_VERSION="0.39.7"
readonly NVM_INSTALL_URL="https://raw.githubusercontent.com/nvm-sh/nvm/v${NVM_VERSION}/install.sh"
readonly SCRIPT_VERSION="1.0.0"

# ─── Colour helpers ───────────────────────────────────────────────────────────
# Disable colours when not writing to a terminal
if [ -t 1 ]; then
  RED='\033[0;31m'; YELLOW='\033[0;33m'; GREEN='\033[0;32m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; YELLOW=''; GREEN=''; CYAN=''; BOLD=''; RESET=''
fi

info()    { printf "${CYAN}[info]${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}[ok]${RESET}    %s\n" "$*"; }
warn()    { printf "${YELLOW}[warn]${RESET}  %s\n" "$*" >&2; }
fatal()   { printf "${RED}[fatal]${RESET} %s\n" "$*" >&2; exit 1; }
section() { printf "\n${BOLD}── %s ──${RESET}\n" "$*"; }

# ─── OS / arch detection ──────────────────────────────────────────────────────
detect_os() {
  OS="unknown"
  ARCH="unknown"
  IS_WSL=false

  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux)
      OS="linux"
      if grep -qi microsoft /proc/version 2>/dev/null; then
        IS_WSL=true
      fi
      ;;
    *)
      fatal "Unsupported operating system: $(uname -s). This script supports macOS and Linux only."
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)
      fatal "Unsupported architecture: $(uname -m). Supported: x64, arm64."
      ;;
  esac

  info "Platform: ${OS} (${ARCH})$(${IS_WSL} && echo ' [WSL]' || echo '')"
}

# ─── Command availability ─────────────────────────────────────────────────────
has_cmd() { command -v "$1" >/dev/null 2>&1; }

# ─── Download helper (curl with wget fallback) ────────────────────────────────
download() {
  local url="$1"
  if has_cmd curl; then
    curl -fsSL "$url"
  elif has_cmd wget; then
    wget -qO- "$url"
  else
    fatal "Neither curl nor wget is available. Install one and re-run."
  fi
}

# ─── Node.js version check ────────────────────────────────────────────────────
node_major() {
  # Returns the major version number, or 0 if node is not found
  if has_cmd node; then
    node --version 2>/dev/null | sed 's/v//' | cut -d. -f1
  else
    echo 0
  fi
}

node_satisfies() {
  local major
  major=$(node_major)
  [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null
}

# ─── nvm bootstrap + install ──────────────────────────────────────────────────
install_node_via_nvm() {
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  local nvm_sh="${nvm_dir}/nvm.sh"

  if [ ! -f "$nvm_sh" ]; then
    info "Bootstrapping nvm v${NVM_VERSION} …"
    download "$NVM_INSTALL_URL" | bash
  fi

  # Source nvm into current session
  # shellcheck source=/dev/null
  export NVM_DIR="$nvm_dir"
  . "$nvm_sh"

  info "Installing Node.js ${NODE_MIN_MAJOR} via nvm …"
  nvm install "$NODE_MIN_MAJOR"
  nvm use "$NODE_MIN_MAJOR"
  nvm alias default "$NODE_MIN_MAJOR"
  success "Node.js $(node --version) ready (nvm)"
}

# ─── macOS: Homebrew ──────────────────────────────────────────────────────────
install_node_via_brew() {
  if ! has_cmd brew; then
    warn "Homebrew not found — falling back to nvm."
    install_node_via_nvm
    return
  fi

  info "Installing node@${NODE_MIN_MAJOR} via Homebrew …"
  brew install "node@${NODE_MIN_MAJOR}" 2>&1 || brew upgrade "node@${NODE_MIN_MAJOR}" 2>&1

  # keg-only: must link manually
  brew link --overwrite --force "node@${NODE_MIN_MAJOR}" 2>/dev/null || true

  if ! node_satisfies; then
    warn "brew link did not put node on PATH — falling back to nvm."
    install_node_via_nvm
    return
  fi
  success "Node.js $(node --version) ready (brew)"
}

# ─── Linux system package managers ───────────────────────────────────────────
install_node_via_system() {
  # NodeSource repo sets up the correct major version
  local setup_url="https://deb.nodesource.com/setup_${NODE_MIN_MAJOR}.x"

  if has_cmd apt-get; then
    info "Installing Node.js ${NODE_MIN_MAJOR} via apt (NodeSource) …"
    download "$setup_url" | sudo -E bash - 2>&1
    sudo apt-get install -y nodejs 2>&1
    success "Node.js $(node --version) ready (apt)"
    return
  fi

  if has_cmd dnf || has_cmd yum; then
    local pm; pm=$(has_cmd dnf && echo dnf || echo yum)
    info "Installing Node.js ${NODE_MIN_MAJOR} via ${pm} (NodeSource) …"
    download "https://rpm.nodesource.com/setup_${NODE_MIN_MAJOR}.x" | sudo bash - 2>&1
    sudo "$pm" install -y nodejs 2>&1
    success "Node.js $(node --version) ready (${pm})"
    return
  fi

  # Alpine
  if has_cmd apk; then
    info "Installing Node.js via apk …"
    apk add --no-cache nodejs npm 2>&1
    success "Node.js $(node --version) ready (apk)"
    return
  fi

  # No system package manager matched — fall through to nvm
  warn "No supported package manager found (apt/dnf/yum/apk) — falling back to nvm."
  install_node_via_nvm
}

# ─── Node.js orchestrator ────────────────────────────────────────────────────
ensure_node() {
  section "Node.js >= ${NODE_MIN_MAJOR}"

  if node_satisfies; then
    success "Node.js $(node --version) already satisfies >= ${NODE_MIN_MAJOR} — skipping install."
    return
  fi

  local current_major
  current_major=$(node_major)
  if [ "$current_major" -gt 0 ]; then
    warn "Node.js v${current_major}.x found, needs upgrade to >= ${NODE_MIN_MAJOR}."
  else
    info "Node.js not found — installing …"
  fi

  case "$OS" in
    macos) install_node_via_brew ;;
    linux)
      # Prefer nvm on Linux/WSL for user-level install (no sudo required)
      install_node_via_nvm || install_node_via_system
      ;;
  esac

  # Final check
  if ! node_satisfies; then
    fatal "Node.js installation completed but 'node --version' still reports < ${NODE_MIN_MAJOR}. \
Open a new shell so PATH changes take effect, then re-run."
  fi

  # Emit reminder when nvm was used (PATH only set in this session)
  if has_cmd nvm 2>/dev/null || [ -f "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    warn "nvm was used. Add the following to your shell profile (~/.bashrc or ~/.zshrc):"
    warn '  export NVM_DIR="$HOME/.nvm"'
    warn '  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"'
  fi
}

# ─── openspec-installer install ──────────────────────────────────────────────
install_openspec_installer() {
  section "Installing ${PACKAGE_NAME}"

  local npm_args=("install" "--global" "$PACKAGE_SOURCE" "--no-fund" "--no-audit")

  # Honour custom registry (enterprise / air-gapped)
  if [ -n "${OPENSPEC_NPM_REGISTRY:-}" ]; then
    info "Using custom registry: ${OPENSPEC_NPM_REGISTRY}"
    npm_args+=("--registry" "$OPENSPEC_NPM_REGISTRY")
  fi

  info "Running: npm ${npm_args[*]} …"
  npm "${npm_args[@]}"

  if ! has_cmd openspec-installer; then
    warn "openspec-installer installed but not found on PATH."
    warn "Run 'npm bin -g' to locate the global bin directory and add it to PATH."
    fatal "Cannot continue — openspec-installer is not executable from PATH."
  fi

  success "openspec-installer $(openspec-installer --version 2>/dev/null || echo 'installed')"
}

# ─── Run the installer ────────────────────────────────────────────────────────
run_installer() {
  section "Running openspec-installer"
  info "Passing through environment variables …"

  # Forward all recognised env vars and any extra flags to the installer
  # Usage: bash install.sh [--force] [--force-skill] [--skip-node] …
  openspec-installer "$@"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  printf "\n${BOLD}╔══════════════════════════════════════════╗${RESET}\n"
  printf "${BOLD}║    openspec-installer bootstrap v%s    ║${RESET}\n" "$SCRIPT_VERSION"
  printf "${BOLD}╚══════════════════════════════════════════╝${RESET}\n\n"

  detect_os
  ensure_node
  install_openspec_installer
  run_installer "$@"

  printf "\n${GREEN}${BOLD}All done!${RESET} Run 'openspec --help' to get started.\n\n"
}

main "$@"
