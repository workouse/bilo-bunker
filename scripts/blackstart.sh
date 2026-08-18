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

# Helper prompt function (reads from /dev/tty when piped, or uses default)
prompt() {
  local label="$1"
  local default_val="${2:-}"
  local response=""

  local prompt_str
  if [ -n "$default_val" ]; then
    prompt_str="$(echo -e "${BOLD}$label${RESET} [default: ${CYAN}$default_val${RESET}]: ")"
  else
    prompt_str="$(echo -e "${BOLD}$label${RESET}: ")"
  fi

  if [ -e /dev/tty ] && [ -r /dev/tty ]; then
    printf "%b" "$prompt_str" > /dev/tty
    read -r response < /dev/tty || true
  elif [ -t 0 ]; then
    printf "%b" "$prompt_str" >&2
    read -r response || true
  else
    response="${default_val:-}"
  fi

  echo "${response:-$default_val}"
}

# Interactive configuration prompts
echo -e "${BOLD}Please enter setup parameters:${RESET}\n"

# Mode Selection: Multi-User vs Single-User
echo -e "${BOLD}Select Bunker Operating Mode:${RESET}"
echo -e "  ${CYAN}[1] Multi-User Mode${RESET} (Recommended: Host remote signer, login via NIP-07/NIP-98)"
echo -e "  ${CYAN}[2] Single-User Mode${RESET} (Dedicated personal signer for a single private key/nsec)"

MODE_CHOICE=$(prompt "Select mode" "1")
OWNER_PUBKEY=""
OWNER_NSEC=""

if [ "$MODE_CHOICE" = "2" ] || [ "$MODE_CHOICE" = "single" ]; then
  # Single-User Mode: Prompt for OWNER_NSEC (nsec1... or 64-char hex)
  while true; do
    OWNER_NSEC_INPUT=$(prompt "Owner Nostr Secret Key (nsec1... or 64-char hex)")
    OWNER_NSEC_TRIMMED="$(echo "$OWNER_NSEC_INPUT" | tr -d '[:space:]')"
    if [[ "$OWNER_NSEC_TRIMMED" =~ ^[0-9a-fA-F]{64}$ ]] || [[ "$OWNER_NSEC_TRIMMED" =~ ^nsec1[02-9ac-hj-np-z]{58}$ ]] || [[ "$OWNER_NSEC_TRIMMED" =~ ^nsec1[a-zA-Z0-9]{58}$ ]]; then
      OWNER_NSEC="$OWNER_NSEC_TRIMMED"
      break
    else
      echo -e "${RED}Invalid Nostr secret key. Must be a valid nsec (nsec1...) or 64 hex characters (0-9, a-f).${RESET}"
    fi
  done
else
  # Multi-User Mode: Prompt for OWNER_PUBKEY (npub1... or 64-char hex)
  while true; do
    OWNER_PUBKEY_INPUT=$(prompt "Admin Nostr Public Key (npub1... or 64-char hex)")
    OWNER_PUBKEY_TRIMMED="$(echo "$OWNER_PUBKEY_INPUT" | tr -d '[:space:]')"
    if [[ "$OWNER_PUBKEY_TRIMMED" =~ ^[0-9a-fA-F]{64}$ ]] || [[ "$OWNER_PUBKEY_TRIMMED" =~ ^npub1[02-9ac-hj-np-z]{58}$ ]] || [[ "$OWNER_PUBKEY_TRIMMED" =~ ^npub1[a-zA-Z0-9]{58}$ ]]; then
      OWNER_PUBKEY="$OWNER_PUBKEY_TRIMMED"
      break
    else
      echo -e "${RED}Invalid Nostr public key. Must be a valid npub (npub1...) or 64 hex characters (0-9, a-f).${RESET}"
    fi
  done
fi

# DOMAIN
DOMAIN=""
while [ -z "$DOMAIN" ]; do
  DOMAIN=$(prompt "Primary Domain (e.g. bunker.example.com or localhost)" "localhost")
  if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Primary domain cannot be empty.${RESET}"
  fi
done

# CERTBOT_EMAIL (@ validation or empty for localhost)
CERTBOT_EMAIL=""
while true; do
  CERTBOT_EMAIL_INPUT=$(prompt "Email Address (for TLS certificates)" "")
  if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ] || [[ "$CERTBOT_EMAIL_INPUT" == *"@"* ]] || [ -z "$CERTBOT_EMAIL_INPUT" ]; then
    CERTBOT_EMAIL="$CERTBOT_EMAIL_INPUT"
    break
  else
    echo -e "${RED}Invalid email address. Must contain '@' or leave empty for localhost.${RESET}"
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
if [ -n "$OWNER_PUBKEY" ]; then
  echo -e "  Owner Pubkey:    ${GREEN}$OWNER_PUBKEY${RESET}"
fi
if [ -n "$OWNER_NSEC" ]; then
  echo -e "  Owner Secret:    ${GREEN}[CONFIGURED]${RESET}"
fi
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
  {
    echo "DOMAIN=$DOMAIN"
    if [ -n "$OWNER_PUBKEY" ]; then
      echo "OWNER_PUBKEY=$OWNER_PUBKEY"
    fi
    if [ -n "$OWNER_NSEC" ]; then
      echo "OWNER_NSEC=$OWNER_NSEC"
    fi
    echo "CERTBOT_EMAIL=$CERTBOT_EMAIL"
    echo "DEFAULT_RELAYS=$DEFAULT_RELAYS"
    echo "PORT=3000"
    echo "DB_PATH=/data/bunker.db"
    echo "LOG_LEVEL=info"
  } > .env
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

