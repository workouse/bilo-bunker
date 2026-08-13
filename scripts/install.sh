#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Bilo Bunker — One-Step Remote VPS Installer
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   bash scripts/install.sh
# Or via remote one-liner:
#   curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/main/scripts/install.sh | bash
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
echo "⚡ Bilo Bunker — One-Step Server Installer"
echo "============================================================"
echo -e "${RESET}"

INSTALL_DIR="${INSTALL_DIR:-/opt/bilo-bunker}"

# 1. Ensure installation directory exists and switch into it
if [ ! -d "$INSTALL_DIR" ]; then
  echo -e "${BOLD}Creating installation directory at ${CYAN}$INSTALL_DIR${RESET}..."
  mkdir -p "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# 2. Check and install Docker & Docker Compose plugin if missing
echo -e "${BOLD}Checking Docker installation...${RESET}"
if ! command -v docker &>/dev/null; then
  echo -e "${YELLOW}Docker not found. Installing Docker engine...${RESET}"
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian)
        apt-get update -qq && apt-get install -y -qq curl docker.io docker-compose-v2
        ;;
      rhel|centos|fedora|ol|rocky|almalinux)
        dnf install -y -q curl docker docker-compose-plugin
        ;;
      alpine)
        apk add --no-cache curl docker docker-compose
        ;;
      *)
        echo -e "${RED}Unsupported OS distribution: ${ID:-unknown}. Please install Docker manually.${RESET}"
        exit 1
        ;;
    esac
  else
    echo -e "${RED}Cannot determine OS release. Please install Docker manually.${RESET}"
    exit 1
  fi
fi

# Ensure docker service is active
if command -v systemctl &>/dev/null; then
  systemctl enable --now docker &>/dev/null || true
elif command -v service &>/dev/null; then
  service docker start &>/dev/null || true
fi

echo -e "${GREEN}✓ Docker engine is ready.${RESET}\n"

# Helper prompt function (supports non-interactive env variable overrides)
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

  if [ -n "$default_val" ]; then
    read -r -p "$(echo -e "${BOLD}$label${RESET} [default: ${CYAN}$default_val${RESET}]: ")" response
    echo "${response:-$default_val}"
  else
    read -r -p "$(echo -e "${BOLD}$label${RESET}: ")" response
    echo "$response"
  fi
}

# 3. Collect Configuration Parameters
echo -e "${BOLD}Configuring Bilo Bunker setup:${RESET}\n"

# DOMAIN
DOMAIN_INPUT=""
while [ -z "$DOMAIN_INPUT" ]; do
  DOMAIN_INPUT=$(prompt "DOMAIN" "Primary Domain (e.g. bunker.example.com or localhost)")
  if [ -z "$DOMAIN_INPUT" ]; then
    echo -e "${RED}Primary domain cannot be empty.${RESET}"
    unset DOMAIN
  fi
done
DOMAIN="$DOMAIN_INPUT"

# OWNER_PUBKEY (64-char hex validation)
OWNER_PUBKEY_INPUT=""
while true; do
  OWNER_PUBKEY_INPUT=$(prompt "OWNER_PUBKEY" "Owner Nostr Public Key (64-char hex)")
  if [[ "$OWNER_PUBKEY_INPUT" =~ ^[0-9a-fA-F]{64}$ ]]; then
    break
  else
    echo -e "${RED}Invalid Nostr public key. Must be exactly 64 hex characters (0-9, a-f).${RESET}"
    unset OWNER_PUBKEY
  fi
done
OWNER_PUBKEY="$OWNER_PUBKEY_INPUT"

# CERTBOT_EMAIL (@ validation)
CERTBOT_EMAIL_INPUT=""
while true; do
  CERTBOT_EMAIL_INPUT=$(prompt "CERTBOT_EMAIL" "Email Address (for TLS certificates)")
  if [[ "$CERTBOT_EMAIL_INPUT" == *"@"* ]]; then
    break
  else
    echo -e "${RED}Invalid email address. Must contain '@'.${RESET}"
    unset CERTBOT_EMAIL
  fi
done
CERTBOT_EMAIL="$CERTBOT_EMAIL_INPUT"

# DEFAULT_RELAYS
DEFAULT_RELAYS=$(prompt "DEFAULT_RELAYS" "Default Relays" "wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol")

# Write .env configuration file
echo -e "\n${BOLD}Writing environment configuration (.env)...${RESET}"
cat <<EOF > .env
DOMAIN=$DOMAIN
OWNER_PUBKEY=$OWNER_PUBKEY
CERTBOT_EMAIL=$CERTBOT_EMAIL
DEFAULT_RELAYS=$DEFAULT_RELAYS
PORT=3000
DB_PATH=/data/bunker.db
LOG_LEVEL=info
EOF
echo -e "${GREEN}✓ .env file created.${RESET}\n"

# 4. Download/Write docker-compose.yml and Caddyfile if not present
if [ ! -f "docker-compose.yml" ]; then
  echo -e "${BOLD}Fetching production docker-compose.yml...${RESET}"
  curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/main/docker-compose.yml -o docker-compose.yml || cat <<'EOF' > docker-compose.yml
services:
  app:
    image: ghcr.io/workouse/bilo-bunker:latest
    restart: unless-stopped
    env_file:
      - path: .env
        required: false
    volumes:
      - sqlite_data:/data
    networks:
      - internal
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
  sqlite_data:
  caddy_data:
  caddy_config:
EOF
  echo -e "${GREEN}✓ docker-compose.yml written.${RESET}\n"
fi

if [ ! -f "Caddyfile" ]; then
  echo -e "${BOLD}Fetching production Caddyfile...${RESET}"
  curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/main/Caddyfile -o Caddyfile || cat <<'EOF' > Caddyfile
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

# 5. Pull latest Docker images and start stack
echo -e "${BOLD}Pulling pre-built Docker image ghcr.io/workouse/bilo-bunker:latest...${RESET}"
docker compose pull
echo -e "${GREEN}✓ Docker images pulled.${RESET}\n"

echo -e "${BOLD}Starting Bilo Bunker services via Docker Compose...${RESET}"
docker compose up -d
echo -e "${GREEN}✓ Container services started.${RESET}\n"

# 6. Health Check Verification
echo -e "${BOLD}Running health check...${RESET}"
HEALTH_PASSED=0
for i in {1..10}; do
  if curl -sf --max-time 5 "http://localhost:3000/api/v1/health" &>/dev/null || \
     curl -sf --max-time 5 "https://$DOMAIN/api/v1/health" &>/dev/null; then
    HEALTH_PASSED=1
    break
  fi
  echo -e "${YELLOW}Waiting for application container health check (attempt $i/10)...${RESET}"
  sleep 3
done

if [ "$HEALTH_PASSED" -eq 1 ]; then
  echo -e "${GREEN}✓ Health check passed!${RESET}\n"
else
  echo -e "${RED}Warning: Health check did not return HTTP 200 OK after 10 attempts.${RESET}"
  echo -e "${YELLOW}Inspect container logs using: docker compose logs${RESET}\n"
fi

# 7. Summary
echo -e "${BOLD}${GREEN}============================================================"
echo "🎉 Bilo Bunker installation complete!"
echo "============================================================"
echo -e "${RESET}"
echo -e "  Installation Path:    ${CYAN}$INSTALL_DIR${RESET}"
echo -e "  Application Endpoint: ${CYAN}https://$DOMAIN${RESET}"
echo -e "  API Health Endpoint:  ${CYAN}https://$DOMAIN/api/v1/health${RESET}"
echo ""
echo -e "To view live logs:    ${CYAN}cd $INSTALL_DIR && docker compose logs -f${RESET}"
echo -e "To restart services:  ${CYAN}cd $INSTALL_DIR && docker compose restart${RESET}"
echo ""
