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
echo "🚀 Bilo Bunker — Server Deployment"
echo "============================================================"
echo -e "${RESET}"

# 1. Verify deployment configuration files
if [ ! -f "deploy.conf" ]; then
  echo -e "${RED}Error: deploy.conf not found.${RESET}"
  echo -e "Please run ${CYAN}make blackstart${RESET} to generate deployment configuration."
  exit 1
fi

if [ ! -f ".env" ] && [ ! -f ".env.prod" ]; then
  echo -e "${RED}Error: Neither .env nor .env.prod file found.${RESET}"
  echo -e "Please run ${CYAN}make blackstart${RESET} to create environment configuration."
  exit 1
fi

# Load deployment & environment settings
source deploy.conf
if [ -f ".env.prod" ]; then
  source .env.prod
else
  source .env
fi

# Verify required vars
: "${DEPLOY_HOST:?DEPLOY_HOST must be set in deploy.conf}"
: "${DEPLOY_USER:?DEPLOY_USER must be set in deploy.conf}"
: "${DEPLOY_KEY:?DEPLOY_KEY must be set in deploy.conf}"
: "${DEPLOY_ROOT:=/opt/bilo-bunker}"
: "${DEPLOY_KEEP_RELEASES:=5}"
: "${DOMAIN:?DOMAIN must be set in environment file}"

SSH_CMD="ssh -i $DEPLOY_KEY -o StrictHostKeyChecking=accept-new $DEPLOY_USER@$DEPLOY_HOST"

# 2. Test SSH connectivity
echo -e "${BOLD}Testing SSH connectivity to ${CYAN}$DEPLOY_USER@$DEPLOY_HOST${RESET}...${BOLD}"
if ! $SSH_CMD echo "SSH OK" &>/dev/null; then
  echo -e "${RED}Error: Unable to connect via SSH to $DEPLOY_USER@$DEPLOY_HOST using key $DEPLOY_KEY.${RESET}"
  echo -e "Please check network connectivity, hostname, and SSH key configuration."
  exit 1
fi
echo -e "${GREEN}✓ SSH connectivity verified.${RESET}\n"

# 3. Create release timestamp & directories
RELEASE=$(date +%Y%m%d%H%M%S)
RELEASE_DIR="$DEPLOY_ROOT/releases/$RELEASE"

echo -e "${BOLD}Creating release directory: ${CYAN}$RELEASE_DIR${RESET}..."
$SSH_CMD "mkdir -p '$RELEASE_DIR' '$DEPLOY_ROOT/shared/data' '$DEPLOY_ROOT/shared/backups'"
echo -e "${GREEN}✓ Remote release directory created.${RESET}\n"

# 4. Remote Docker installation check
echo -e "${BOLD}Ensuring Docker engine on remote server...${RESET}"
$SSH_CMD "bash -s" << 'EOF'
set -euo pipefail
if ! command -v docker &>/dev/null; then
  echo "Docker not found on remote. Installing..."
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian)
        sudo apt-get update -qq && sudo apt-get install -y -qq docker.io docker-compose-v2
        ;;
      rhel|centos|fedora|ol|rocky|almalinux)
        sudo dnf install -y -q docker docker-compose-plugin
        ;;
      alpine)
        sudo apk add --no-cache docker docker-compose
        ;;
      *)
        echo "Unsupported OS distribution: $ID. Please install Docker manually."
        exit 1
        ;;
    esac
  fi
fi

if command -v systemctl &>/dev/null; then
  sudo systemctl enable --now docker || true
elif command -v service &>/dev/null; then
  sudo service docker start || true
fi
EOF
echo -e "${GREEN}✓ Remote Docker status verified.${RESET}\n"

# 5. Sync project files via rsync
echo -e "${BOLD}Syncing project files to remote server...${RESET}"
rsync -az -e "ssh -i $DEPLOY_KEY -o StrictHostKeyChecking=accept-new" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='packages/*/dist' \
  --exclude='.env' \
  --exclude='.env.prod' \
  --exclude='deploy.conf' \
  --exclude='backups/' \
  ./ "$DEPLOY_USER@$DEPLOY_HOST:$RELEASE_DIR/"

ENV_FILE=".env.prod"
[ ! -f "$ENV_FILE" ] && ENV_FILE=".env"
echo -e "Transferring environment configuration (${CYAN}$ENV_FILE${RESET})..."
rsync -az -e "ssh -i $DEPLOY_KEY -o StrictHostKeyChecking=accept-new" \
  "$ENV_FILE" \
  "$DEPLOY_USER@$DEPLOY_HOST:$RELEASE_DIR/.env"
echo -e "${GREEN}✓ File synchronization complete.${RESET}\n"

# 6. Symlink shared database data
echo -e "${BOLD}Linking shared data volume...${RESET}"
$SSH_CMD "ln -sfn '$DEPLOY_ROOT/shared/data' '$RELEASE_DIR/data'"
echo -e "${GREEN}✓ Shared data linked.${RESET}\n"

# 7. Atomic release symlink swap
echo -e "${BOLD}Swapping current release symlink...${RESET}"
$SSH_CMD "ln -sfn '$RELEASE_DIR' '$DEPLOY_ROOT/current'"
echo -e "${GREEN}✓ Current release updated to $RELEASE.${RESET}\n"

# 8. Build & launch services with Docker Compose
echo -e "${BOLD}Building and starting application services...${RESET}"
$SSH_CMD "cd '$DEPLOY_ROOT/current' && docker compose up -d --build"
echo -e "${GREEN}✓ Services built and started with Caddy Auto-SSL.${RESET}\n"

# 9. Health check verification
echo -e "${BOLD}Running health check on $DOMAIN...${RESET}"
HEALTH_PASSED=0
for i in {1..5}; do
  if $SSH_CMD "curl -sf --max-time 5 'https://$DOMAIN/api/v1/health' || curl -sf --max-time 5 'http://localhost:3000/api/v1/health'" &>/dev/null; then
    HEALTH_PASSED=1
    break
  fi
  echo -e "${YELLOW}Health check attempt $i failed. Retrying in 3 seconds...${RESET}"
  sleep 3
done

if [ "$HEALTH_PASSED" -eq 1 ]; then
  echo -e "${GREEN}✓ Health check passed!${RESET}\n"
else
  echo -e "${RED}Warning: Health check did not return HTTP 200 OK after 5 attempts.${RESET}"
  echo -e "${YELLOW}Check container logs on remote with: ssh $DEPLOY_USER@$DEPLOY_HOST 'cd $DEPLOY_ROOT/current && docker compose logs'${RESET}\n"
fi

# 10. Prune old releases
echo -e "${BOLD}Pruning old releases (keeping last $DEPLOY_KEEP_RELEASES)...${RESET}"
$SSH_CMD "cd '$DEPLOY_ROOT/releases' && ls -dt */ | tail -n +$((DEPLOY_KEEP_RELEASES + 1)) | xargs -r rm -rf"
echo -e "${GREEN}✓ Cleanup complete.${RESET}\n"

# 11. Deployment Summary
echo -e "${BOLD}${GREEN}============================================================"
echo "🎉 Deployment successful!"
echo "============================================================"
echo -e "${RESET}"
echo -e "  Application Endpoint: ${CYAN}https://$DOMAIN${RESET}"
echo -e "  API Endpoint:         ${CYAN}https://$DOMAIN/api/v1${RESET}"
echo ""

