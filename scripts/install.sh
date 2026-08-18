#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Bilo Bunker — One-Step Server Installer & Updater
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   curl -fsSL https://bunker.workouse.com/install.sh | bash
# Or:
#   curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/main/scripts/install.sh | bash
# Or locally:
#   bash scripts/install.sh
# ─────────────────────────────────────────────────────────────────────────────

# ANSI color variables
BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}${CYAN}"
echo "============================================================"
echo "⚡ Bilo Bunker — Server Installer & Updater"
echo "============================================================"
echo -e "${RESET}"

# 1. Determine Installation Directory (Safe default in user's home)
INSTALL_DIR="${INSTALL_DIR:-"$HOME/bunker"}"

if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${BOLD}Creating installation directory at ${CYAN}$INSTALL_DIR${RESET}..."
  mkdir -p "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# Helper prompt function (reads from /dev/tty when piped, or uses env/default)
prompt() {
  local var_name="$1"
  local label="$2"
  local default_val="${3:-}"
  local current_val="${!var_name:-}"
  local response=""

  if [ -n "$current_val" ]; then
    echo "$current_val"
    return
  fi

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
    if [ -n "$default_val" ]; then
      response="$default_val"
    else
      echo -e "${RED}Error: Non-interactive environment and required parameter '$var_name' is unset.${RESET}" >&2
      exit 1
    fi
  fi

  echo "${response:-$default_val}"
}

# 2. Check Docker & Docker Compose Compatibility (Rootless & Standard)
echo -e "${BOLD}Checking Docker environment...${RESET}"

if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}Docker is not installed.${RESET}"
  if [ "$EUID" -eq 0 ] || command -v sudo &>/dev/null; then
    SUDO_CMD=""
    [ "$EUID" -ne 0 ] && SUDO_CMD="sudo"
    echo -e "${BOLD}Attempting automated Docker installation...${RESET}"
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "${ID:-}" in
        ubuntu|debian)
          $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y -qq curl docker.io docker-compose-v2
          ;;
        rhel|centos|fedora|ol|rocky|almalinux)
          $SUDO_CMD dnf install -y -q curl docker docker-compose-plugin
          ;;
        alpine)
          $SUDO_CMD apk add --no-cache curl docker docker-compose
          ;;
        *)
          echo -e "${RED}Unsupported OS distribution: ${ID:-unknown}. Please install Docker or rootless Docker manually.${RESET}"
          exit 1
          ;;
      esac
    else
      echo -e "${RED}Cannot determine OS release. Please install Docker manually.${RESET}"
      exit 1
    fi
  else
    echo -e "${RED}Error: Docker is missing and sudo privileges are unavailable.${RESET}"
    echo -e "Please install Docker or configure Rootless Docker (dockerd-rootless-setuptool.sh install)."
    exit 1
  fi
fi

# Determine Docker Compose command
DOCKER_COMPOSE=""
if docker compose version &>/dev/null; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null && docker-compose version &>/dev/null; then
  DOCKER_COMPOSE="docker-compose"
else
  echo -e "${RED}Error: Neither 'docker compose' (v2 plugin) nor 'docker-compose' was found.${RESET}"
  exit 1
fi

# Ensure Docker daemon is accessible for current user (handles rootless & group permissions)
if ! docker info &>/dev/null; then
  echo -e "${YELLOW}Docker daemon is not running or not accessible for current user.${RESET}"
  # Check if user-level rootless Docker service is available
  if command -v systemctl &>/dev/null && systemctl --user is-active docker &>/dev/null; then
    echo -e "${CYAN}Rootless Docker service detected.${RESET}"
  elif command -v systemctl &>/dev/null; then
    echo -e "${BOLD}Attempting to start rootless Docker service...${RESET}"
    systemctl --user start docker &>/dev/null || true
  fi

  # Re-check after user start attempt
  if ! docker info &>/dev/null; then
    # Try system-level service if root or sudo
    if [ "$EUID" -eq 0 ] && command -v systemctl &>/dev/null; then
      systemctl enable --now docker &>/dev/null || true
    elif command -v sudo &>/dev/null && sudo -n systemctl enable --now docker &>/dev/null; then
      sudo systemctl enable --now docker &>/dev/null || true
    fi
  fi

  # Final accessibility check
  if ! docker info &>/dev/null; then
    echo -e "${RED}Cannot communicate with Docker daemon.${RESET}"
    echo -e "If using Rootless Docker, ensure it is active: ${CYAN}systemctl --user start docker${RESET}"
    echo -e "If using standard Docker, add your user to the docker group: ${CYAN}sudo usermod -aG docker \$USER${RESET} (and re-login)."
    exit 1
  fi
fi

echo -e "${GREEN}✓ Docker engine ($DOCKER_COMPOSE) is ready.${RESET}\n"

# 3. Detect Existing Installation & Update Option
IS_EXISTING=0
ACTION_MODE="install"
if [ -f ".env" ] && [ -f "docker-compose.yml" ]; then
  IS_EXISTING=1
  # Load current config for reference
  # shellcheck disable=SC1091
  source .env 2>/dev/null || true

  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
  echo -e "${BOLD}Existing Bilo Bunker installation detected at ${CYAN}$INSTALL_DIR${RESET}"
  if [ -n "${DOMAIN:-}" ]; then
    echo -e "  Domain: ${GREEN}$DOMAIN${RESET}"
  fi
  echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n"

  echo -e "${BOLD}Choose an action:${RESET}"
  echo -e "  ${CYAN}[1] Update to latest version${RESET} (pull latest Docker images & restart)"
  echo -e "  ${CYAN}[2] Reconfigure settings${RESET} (update domain, keys, relays)"
  echo -e "  ${CYAN}[3] Reinstall${RESET} (clean configuration & setup)"

  CHOICE=$(prompt "INSTALL_ACTION" "Select option" "1")
  case "$CHOICE" in
    1|"update"|"UPDATE")
      ACTION_MODE="update"
      ;;
    2|"reconfigure"|"RECONFIGURE")
      ACTION_MODE="reconfigure"
      ;;
    3|"reinstall"|"REINSTALL")
      ACTION_MODE="reinstall"
      ;;
    *)
      ACTION_MODE="update"
      ;;
  esac
fi

# 4. Configuration Collection (Skipped in update mode)
if [ "$ACTION_MODE" != "update" ]; then
  echo -e "${BOLD}Configuring Bilo Bunker setup:${RESET}\n"

  # Mode Selection: Multi-User vs Single-User
  echo -e "${BOLD}Select Bunker Operating Mode:${RESET}"
  echo -e "  ${CYAN}[1] Multi-User Mode${RESET} (Recommended: Host remote signer, login via NIP-07/NIP-98)"
  echo -e "  ${CYAN}[2] Single-User Mode${RESET} (Dedicated personal signer for a single private key/nsec)"

  DEFAULT_MODE_CHOICE="1"
  if [ -n "${OWNER_NSEC:-}" ]; then
    DEFAULT_MODE_CHOICE="2"
  fi
  MODE_CHOICE=$(prompt "BUNKER_MODE" "Select mode" "$DEFAULT_MODE_CHOICE")

  OWNER_PUBKEY_VAL=""
  OWNER_NSEC_VAL=""

  if [ "$MODE_CHOICE" = "2" ] || [ "$MODE_CHOICE" = "single" ]; then
    # Single-User Mode: Prompt for OWNER_NSEC (nsec1... or 64-char hex)
    while true; do
      OWNER_NSEC_INPUT=$(prompt "OWNER_NSEC" "Owner Nostr Secret Key (nsec1... or 64-char hex)" "${OWNER_NSEC:-}")
      OWNER_NSEC_TRIMMED="$(echo "$OWNER_NSEC_INPUT" | tr -d '[:space:]')"
      if [[ "$OWNER_NSEC_TRIMMED" =~ ^[0-9a-fA-F]{64}$ ]] || [[ "$OWNER_NSEC_TRIMMED" =~ ^nsec1[02-9ac-hj-np-z]{58}$ ]] || [[ "$OWNER_NSEC_TRIMMED" =~ ^nsec1[a-zA-Z0-9]{58}$ ]]; then
        OWNER_NSEC_VAL="$OWNER_NSEC_TRIMMED"
        break
      else
        echo -e "${RED}Invalid Nostr secret key. Must be a valid nsec (nsec1...) or 64 hex characters (0-9, a-f).${RESET}"
        unset OWNER_NSEC
      fi
    done
  else
    # Multi-User Mode: Prompt for OWNER_PUBKEY (npub1... or 64-char hex)
    while true; do
      OWNER_PUBKEY_INPUT=$(prompt "OWNER_PUBKEY" "Admin Nostr Public Key (npub1... or 64-char hex)" "${OWNER_PUBKEY:-${OWNER_NPUB:-}}")
      OWNER_PUBKEY_TRIMMED="$(echo "$OWNER_PUBKEY_INPUT" | tr -d '[:space:]')"
      if [[ "$OWNER_PUBKEY_TRIMMED" =~ ^[0-9a-fA-F]{64}$ ]] || [[ "$OWNER_PUBKEY_TRIMMED" =~ ^npub1[02-9ac-hj-np-z]{58}$ ]] || [[ "$OWNER_PUBKEY_TRIMMED" =~ ^npub1[a-zA-Z0-9]{58}$ ]]; then
        OWNER_PUBKEY_VAL="$OWNER_PUBKEY_TRIMMED"
        break
      else
        echo -e "${RED}Invalid Nostr public key. Must be a valid npub (npub1...) or 64 hex characters (0-9, a-f).${RESET}"
        unset OWNER_PUBKEY
      fi
    done
  fi

  # DOMAIN
  DOMAIN_INPUT=""
  while [ -z "$DOMAIN_INPUT" ]; do
    DOMAIN_INPUT=$(prompt "DOMAIN" "Primary Domain (e.g. bunker.example.com or localhost)" "${DOMAIN:-localhost}")
    if [ -z "$DOMAIN_INPUT" ]; then
      echo -e "${RED}Primary domain cannot be empty.${RESET}"
      unset DOMAIN
    fi
  done
  DOMAIN="$DOMAIN_INPUT"

  # CERTBOT_EMAIL (@ validation or empty for localhost)
  CERTBOT_EMAIL_INPUT=""
  DEFAULT_EMAIL="${CERTBOT_EMAIL:-}"
  while true; do
    CERTBOT_EMAIL_INPUT=$(prompt "CERTBOT_EMAIL" "Email Address (for TLS certificates)" "$DEFAULT_EMAIL")
    if [ "$DOMAIN" = "localhost" ] || [ "$DOMAIN" = "127.0.0.1" ] || [[ "$CERTBOT_EMAIL_INPUT" == *"@"* ]] || [ -z "$CERTBOT_EMAIL_INPUT" ]; then
      break
    else
      echo -e "${RED}Invalid email address. Must contain '@' or leave empty for localhost.${RESET}"
      unset CERTBOT_EMAIL
    fi
  done
  CERTBOT_EMAIL="$CERTBOT_EMAIL_INPUT"

  # DEFAULT_RELAYS
  DEFAULT_RELAYS=$(prompt "DEFAULT_RELAYS" "Default Relays" "${DEFAULT_RELAYS:-wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol}")

  # Write / Backup .env configuration file
  if [ -f ".env" ]; then
    cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
  fi

  echo -e "\n${BOLD}Writing environment configuration (.env)...${RESET}"
  {
    echo "COMPOSE_PROJECT_NAME=bunker"
    echo "DOMAIN=$DOMAIN"
    if [ -n "$OWNER_PUBKEY_VAL" ]; then
      echo "OWNER_PUBKEY=$OWNER_PUBKEY_VAL"
    fi
    if [ -n "$OWNER_NSEC_VAL" ]; then
      echo "OWNER_NSEC=$OWNER_NSEC_VAL"
    fi
    echo "CERTBOT_EMAIL=$CERTBOT_EMAIL"
    echo "DEFAULT_RELAYS=$DEFAULT_RELAYS"
    echo "PORT=3000"
    echo "DB_PATH=/data/bunker.db"
    echo "LOG_LEVEL=info"
  } > .env
  echo -e "${GREEN}✓ .env file created.${RESET}\n"
fi

# Reload DOMAIN from .env for summary and checks
# shellcheck disable=SC1091
source .env 2>/dev/null || true
DOMAIN="${DOMAIN:-localhost}"

# 5. Ensure docker-compose.yml and Caddyfile are present
if [ ! -f "docker-compose.yml" ] || [ "$ACTION_MODE" = "reinstall" ]; then
  echo -e "${BOLD}Writing production docker-compose.yml...${RESET}"
  cat <<'EOF' > docker-compose.yml
name: bunker

services:
  app:
    image: ghcr.io/workouse/bilo-bunker:latest
    restart: unless-stopped
    env_file:
      - path: .env
        required: false
    volumes:
      - ./data:/data
    networks:
      - internal
      - external
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 10s

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      - DOMAIN=${DOMAIN:-localhost}
      - CERTBOT_EMAIL=${CERTBOT_EMAIL:-}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - internal
      - external
    depends_on:
      app:
        condition: service_healthy

networks:
  internal:
    driver: bridge
    internal: true
  external:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
EOF
  echo -e "${GREEN}✓ docker-compose.yml written.${RESET}\n"
fi

if [ ! -f "Caddyfile" ] || [ "$ACTION_MODE" = "reinstall" ]; then
  echo -e "${BOLD}Writing production Caddyfile...${RESET}"
  cat <<'EOF' > Caddyfile
{
    email {$CERTBOT_EMAIL}
}

{$DOMAIN} {
    encode zstd gzip

    handle_path /api/* {
        reverse_proxy app:3000
    }

    handle {
        reverse_proxy app:3000
    }
}
EOF
  echo -e "${GREEN}✓ Caddyfile written.${RESET}\n"
fi

# 6. Generate standalone update.sh script for future 1-step updates
cat <<EOF > update.sh
#!/usr/bin/env bash
set -euo pipefail
cd "\$(dirname "\$0")"
echo "Pulling latest Bilo Bunker images..."
$DOCKER_COMPOSE pull
echo "Restarting services..."
$DOCKER_COMPOSE up -d
echo "✓ Bilo Bunker updated successfully!"
EOF
chmod +x update.sh

# 7. Pull latest Docker images and launch / update stack
echo -e "${BOLD}Pulling pre-built Docker images (ghcr.io/workouse/bilo-bunker:latest & caddy:2-alpine)...${RESET}"
$DOCKER_COMPOSE pull
echo -e "${GREEN}✓ Docker images pulled.${RESET}\n"

echo -e "${BOLD}Starting Bilo Bunker services via Docker Compose...${RESET}"
$DOCKER_COMPOSE up -d
echo -e "${GREEN}✓ Container services started.${RESET}\n"

# 8. Health Check Verification
echo -e "${BOLD}Running health check...${RESET}"
HEALTH_PASSED=0
for i in {1..12}; do
  # Test via docker compose exec inside the container first
  if $DOCKER_COMPOSE exec -T app wget -qO- http://localhost:3000/api/v1/health &>/dev/null; then
    HEALTH_PASSED=1
    break
  fi
  # Fallback: test via curl against localhost or domain
  if curl -k -sf --max-time 3 "http://localhost/api/v1/health" &>/dev/null || \
     curl -k -sf --max-time 3 "https://localhost/api/v1/health" &>/dev/null || \
     curl -k -sf --max-time 3 "https://$DOMAIN/api/v1/health" &>/dev/null; then
    HEALTH_PASSED=1
    break
  fi
  echo -e "${YELLOW}Waiting for application container to become healthy (attempt $i/12)...${RESET}"
  sleep 3
done

if [ "$HEALTH_PASSED" -eq 1 ]; then
  echo -e "${GREEN}✓ Health check passed!${RESET}\n"
else
  echo -e "${RED}Warning: Health check did not return HTTP 200 OK after 12 attempts.${RESET}"
  echo -e "${YELLOW}Inspect container logs using: $DOCKER_COMPOSE logs${RESET}\n"
fi

# 9. Summary
echo -e "${BOLD}${GREEN}============================================================"
if [ "$ACTION_MODE" = "update" ]; then
  echo "🎉 Bilo Bunker update complete!"
else
  echo "🎉 Bilo Bunker installation complete!"
fi
echo "============================================================"
echo -e "${RESET}"
echo -e "  Installation Path:    ${CYAN}$INSTALL_DIR${RESET}"
if [ "$DOMAIN" = "localhost" ]; then
  echo -e "  Application Endpoint: ${CYAN}http://localhost${RESET}"
  echo -e "  API Health Endpoint:  ${CYAN}http://localhost/api/v1/health${RESET}"
else
  echo -e "  Application Endpoint: ${CYAN}https://$DOMAIN${RESET}"
  echo -e "  API Health Endpoint:  ${CYAN}https://$DOMAIN/api/v1/health${RESET}"
fi
echo ""
echo -e "  To update anytime:    ${CYAN}$INSTALL_DIR/update.sh${RESET}"
echo -e "  To view live logs:    ${CYAN}cd $INSTALL_DIR && $DOCKER_COMPOSE logs -f${RESET}"
echo -e "  To restart services:  ${CYAN}cd $INSTALL_DIR && $DOCKER_COMPOSE restart${RESET}"
echo ""

