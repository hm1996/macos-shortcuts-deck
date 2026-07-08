#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BOLD="\033[1m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
CYAN="\033[36m"
RESET="\033[0m"

section() { echo -e "\n${BOLD}${CYAN}▸ $1${RESET}"; }
ok()     { echo -e "  ${GREEN}✓${RESET} $1"; }
warn()   { echo -e "  ${YELLOW}⚠${RESET} $1"; }
err()    { echo -e "  ${RED}✗${RESET} $1"; }
info()   { echo -e "  ℹ  $1"; }

echo -e "${BOLD}┌─────────────────────────────────────┐${RESET}"
echo -e "${BOLD}│  macOS Control Center Deck — setup  │${RESET}"
echo -e "${BOLD}└─────────────────────────────────────┘${RESET}"

# ── Node.js ──
section "Checking Node.js"
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v)
  ok "Node.js ${NODE_VERSION}"
else
  err "Node.js not found. Install it from https://nodejs.org or 'brew install node'"
  exit 1
fi

# ── npm dependencies ──
section "Installing npm dependencies"
if npm install; then
  ok "Dependencies installed"
else
  err "npm install failed"
  exit 1
fi

# ── .env ──
section "Configuring .env"
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example"
  warn "Open .env and configure: DCC_GIT_ORG, DCC_GIT_WORKSPACE, incident.io keys"
else
  ok ".env already exists (skipping)"
fi

# ── state directory ──
section "Creating state directory"
mkdir -p state
ok "state/ ready"

# ── certs directory ──
section "Setting up certs directory"
mkdir -p certs
if [ -f certs/dcc-local.key ] && [ -f certs/dcc-local.fullchain.crt ]; then
  ok "TLS certs already present"
else
  warn "No TLS certs found"
  info "Generate with: bash scripts/generate-lan-cert.sh <YOUR_LAN_IP>"
  info "Server will fall back to HTTP in the meantime"
fi

# ── macOS-only tools (warn, don't fail) ──
section "Checking optional tools"

check_tool() {
  if command -v "$1" &>/dev/null; then
    ok "$1"
    return 0
  else
    warn "$1 not found"
    return 1
  fi
}

check_tool aws
check_tool gh
check_tool kubectl
check_tool openssl

# ── AWS profiles ──
section "AWS profiles"
warn "Set DCC_AWS_PROFILES in .env with your AWS CLI profile names (comma-separated)"

echo ""
echo -e "${BOLD}${GREEN}┌─────────────────────────────────────┐${RESET}"
echo -e "${BOLD}${GREEN}│  Setup complete!                     │${RESET}"
echo -e "${BOLD}${GREEN}└─────────────────────────────────────┘${RESET}"
echo ""
echo -e "  ${BOLD}Start the server:${RESET}"
echo -e "    ${CYAN}npm start         ${RESET}  # production"
echo -e "    ${CYAN}npm run start:normal${RESET}  # HTTP-only (no TLS)"
echo -e "    ${CYAN}npm run dev       ${RESET}  # auto-reload (server + agent)"
echo ""
echo -e "  ${BOLD}Or use the launch scripts:${RESET}"
echo -e "    ${CYAN}bin/dcc-start${RESET}"
echo -e "    ${CYAN}bin/dcc-stop${RESET}"
echo ""
echo -e "  ${BOLD}Open on your tablet:${RESET}"
echo -e "    ${CYAN}http://<mac-ip>:8721${RESET}"
echo ""