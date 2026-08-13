#!/usr/bin/env bash
set -euo pipefail

# ANSI color variables
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
echo "============================================================"
echo "⚡ Bilo Bunker — First Time Setup & Blackstart"
echo "============================================================"
echo -e "${RESET}"

# 1. Pre-flight check for required tools
echo -e "${BOLD}Checking required local tools...${RESET}"
MISSING_TOOLS=()
for tool in docker rsync ssh; do
  if ! command -v "$tool" &>/dev/null; then
    MISSING_TOOLS+=("$tool")
  fi
done

if [ ${#MISSING_TOOLS[@]} -gt 0 ]; then
  echo -e "${RED}Error: The following required CLI tools are missing:${RESET}"
  for tool in "${MISSING_TOOLS[@]}"; do
    echo -e "  - ${YELLOW}$tool${RESET}"
  done
  echo -e "Please install them and run this script again."
  exit 1
fi
echo -e "${GREEN}✓ All required local tools (docker, rsync, ssh) are present.${RESET}\n"

# Helper prompt function
prompt() {
  local label="$1"
  local default_val="${2:-}"
  local response=""

  if [ -n "$default_val" ]; then
    read -r -p "$(echo -e "${BOLD}$label${RESET} [default: ${CYAN}$default_val${RESET}]: ")" response
    echo "${response:-$default_val}"
  else
    read -r -p "$(echo -e "${BOLD}$label${RESET}: ")" response
    echo "$response"
  fi
}

# Interactive configuration prompts
echo -e "${BOLD}Please enter setup parameters:${RESET}\n"

# DOMAIN
DOMAIN=""
while [ -z "$DOMAIN" ]; do
  DOMAIN=$(prompt "Primary Domain (e.g. bunker.example.com or localhost)")
  if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Primary domain cannot be empty.${RESET}"
  fi
done

# OWNER_PUBKEY (hex 64 validation)
OWNER_PUBKEY=""
while true; do
  OWNER_PUBKEY=$(prompt "Owner Nostr Public Key (64-char hex)")
  if [[ "$OWNER_PUBKEY" =~ ^[0-9a-fA-F]{64}$ ]]; then
    break
  else
    echo -e "${RED}Invalid Nostr public key. Must be exactly 64 hex characters (0-9, a-f).${RESET}"
  fi
done

# CERTBOT_EMAIL (@ validation)
CERTBOT_EMAIL=""
while true; do
  CERTBOT_EMAIL=$(prompt "Email Address (for TLS certificates)")
  if [[ "$CERTBOT_EMAIL" == *"@"* ]]; then
    break
  else
    echo -e "${RED}Invalid email address. Must contain '@'.${RESET}"
  fi
done

# DEFAULT_RELAYS
DEFAULT_RELAYS=$(prompt "Default Relays" "wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol")

# DEPLOY_HOST
DEPLOY_HOST=""
while [ -z "$DEPLOY_HOST" ]; do
  DEPLOY_HOST=$(prompt "Deployment Host (IP or hostname of server)")
  if [ -z "$DEPLOY_HOST" ]; then
    echo -e "${RED}Deployment host cannot be empty.${RESET}"
  fi
done

DEPLOY_USER=$(prompt "Deployment SSH User" "ubuntu")
DEPLOY_KEY=$(prompt "Deployment SSH Private Key Path" "~/.ssh/id_rsa")

# Summary
echo -e "\n${BOLD}${CYAN}============================================================"
echo "Configuration Summary"
echo "============================================================"
echo -e "${RESET}"
echo -e "  Domain:          ${GREEN}$DOMAIN${RESET}"
echo -e "  Owner Pubkey:    ${GREEN}$OWNER_PUBKEY${RESET}"
echo -e "  Cert Email:      ${GREEN}$CERTBOT_EMAIL${RESET}"
echo -e "  Default Relays:  ${GREEN}$DEFAULT_RELAYS${RESET}"
echo -e "  Deploy Host:     ${GREEN}$DEPLOY_HOST${RESET}"
echo -e "  Deploy User:     ${GREEN}$DEPLOY_USER${RESET}"
echo -e "  Deploy Key:      ${GREEN}$DEPLOY_KEY${RESET}"
echo ""

CONFIRM=$(prompt "Save these values? [y/N]" "N")
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo -e "${YELLOW}Aborted without saving.${RESET}"
  exit 0
fi

# Write .env
if [ -f ".env" ]; then
  OVERWRITE_ENV=$(prompt ".env file already exists. Overwrite? [y/N]" "N")
  if [[ "$OVERWRITE_ENV" =~ ^[Yy]$ ]]; then
    WRITE_ENV=1
  else
    WRITE_ENV=0
    echo -e "${YELLOW}Skipping .env creation.${RESET}"
  fi
else
  WRITE_ENV=1
fi

if [ "${WRITE_ENV:-0}" -eq 1 ]; then
  if [ -f ".env.dist" ]; then
    cp .env.dist .env
  else
    cp .env.example .env
  fi
  sed -i "s|^OWNER_PUBKEY=.*|OWNER_PUBKEY=$OWNER_PUBKEY|" .env
  sed -i "s|^DEFAULT_RELAYS=.*|DEFAULT_RELAYS=$DEFAULT_RELAYS|" .env
  sed -i "s|^CERTBOT_EMAIL=.*|CERTBOT_EMAIL=$CERTBOT_EMAIL|" .env
  sed -i "s|^DOMAIN=.*|DOMAIN=$DOMAIN|" .env
  echo -e "${GREEN}✓ Created .env${RESET}"
fi

# Write deploy.conf
if [ -f "deploy.conf" ]; then
  OVERWRITE_DEPLOY=$(prompt "deploy.conf file already exists. Overwrite? [y/N]" "N")
  if [[ "$OVERWRITE_DEPLOY" =~ ^[Yy]$ ]]; then
    WRITE_DEPLOY=1
  else
    WRITE_DEPLOY=0
    echo -e "${YELLOW}Skipping deploy.conf creation.${RESET}"
  fi
else
  WRITE_DEPLOY=1
fi

if [ "${WRITE_DEPLOY:-0}" -eq 1 ]; then
  cp deploy.conf.example deploy.conf
  sed -i "s|^DEPLOY_HOST=.*|DEPLOY_HOST=$DEPLOY_HOST|" deploy.conf
  sed -i "s|^DEPLOY_USER=.*|DEPLOY_USER=$DEPLOY_USER|" deploy.conf
  sed -i "s|^DEPLOY_KEY=.*|DEPLOY_KEY=$DEPLOY_KEY|" deploy.conf
  echo -e "${GREEN}✓ Created deploy.conf${RESET}"
fi

echo -e "\n${BOLD}${GREEN}============================================================"
echo "⚡ Configuration complete!"
echo "============================================================"
echo -e "${RESET}"

RUN_DEPLOY=$(prompt "Run make deploy-remote now? [y/N]" "N")
if [[ "$RUN_DEPLOY" =~ ^[Yy]$ ]]; then
  echo -e "${BOLD}Executing make deploy-remote...${RESET}"
  exec make deploy-remote
fi

