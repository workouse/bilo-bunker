# Bilo Bunker — Deployment & Operations Guide

This guide details the prerequisites, initial setup, deployment procedures, alternative cloud deployment (Fly.io), updates, backup management, and troubleshooting for Bilo Bunker.

---

## 1. Prerequisites

### Workstation Requirements
- **Docker** & **Docker Compose** (v2.0+)
- **Node.js** ≥ 22 (managed via `nvm`)
- **Tools**: `git`, `bash`, `rsync`, `ssh`

### Server Requirements
- **Operating System**: Linux VPS (Ubuntu/Debian, RHEL/OL, Fedora, Alpine)
- **Networking**: Public IP address with inbound ports `80` (HTTP) and `443` (HTTPS) open
- **Access**: SSH key-based access configured (`ssh -i ~/.ssh/id_rsa user@host`) with `sudo` or Docker group privileges for the deployment user

### DNS Setup
Before starting deployment, configure a single **A-record** with your DNS provider pointing to your server's public IP address:
- `bunker.example.com` (Primary domain serving SPA dashboard and `/api/*` endpoints)

---

## 2. Quickstart & One-Step Server Installer

### Option A: One-Step Remote VPS Installer (Single Line)

On any fresh Linux VPS (Ubuntu/Debian, CentOS/RHEL/Alma/Rocky, Alpine), run:

```bash
curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/main/scripts/install.sh | bash
```

Or run locally via Makefile:
```bash
make install-remote
```

The installer automatically installs Docker & Docker Compose if missing, interactively prompts for your environment parameters (`DOMAIN`, `OWNER_PUBKEY`, `CERTBOT_EMAIL`), downloads production compose configurations, pulls the pre-built Docker image (`ghcr.io/workouse/bilo-bunker:latest`), and launches the stack with auto-renewing Let's Encrypt TLS certificates.

### Option B: Manual Docker Compose Stack

```bash
# 1. Clone repository and create configuration
git clone https://github.com/workouse/bilo-bunker.git
cd bilo-bunker
cp .env.dist .env

# 2. Edit .env with your domain, email, and Nostr owner pubkey
nano .env

# 3. Launch single-command production stack
docker compose up -d
```

Caddy will automatically request a Let's Encrypt / ZeroSSL TLS certificate for your `DOMAIN`, configure HTTPS on port 443 with HTTP-to-HTTPS redirect on port 80, and handle background auto-renewals.

---

## 3. Interactive First-Time Setup (`make blackstart`)

If deploying via SSH from a local machine, initialize deployment configuration using the setup wizard:

```bash
make blackstart
```

The setup script (`scripts/blackstart.sh`) will prompt you for:
- **Primary Domain** (`DOMAIN` — e.g. `bunker.example.com`)
- **Owner Public Key** (`OWNER_PUBKEY` — 64-character hex Nostr public key)
- **Email Address** (`CERTBOT_EMAIL` for TLS certificate registration)
- **Default Relays** (comma-separated `wss://` URLs)
- **Deployment Connection**: Host IP/hostname, SSH user, and path to private SSH key

### Config Files Created (Git-Ignored)
- `.env` — Service environment variables (loaded by Docker Compose)
- `deploy.conf` — Deployment server configuration for SSH/rsync

---

## 4. Automated Remote SSH Deployment (`make deploy-remote` / `make deploy`)

Deploy updates to your remote VPS with a single command:

```bash
make deploy-remote
# or
make deploy
```

### Deployment Pipeline Workflow (`scripts/deploy.sh`)

1. **Connectivity Check**: Tests SSH access to the deployment host.
2. **Docker Check**: Installs Docker and Docker Compose if missing on remote server.
3. **Release Isolation**: Creates timestamped release directory (`$DEPLOY_ROOT/releases/<TIMESTAMP>`).
4. **File Sync**: Transfers project configurations and manifests via `rsync`.
5. **Data Symlinking**: Symlinks shared data (`$DEPLOY_ROOT/shared/data`) to `/data` in release directory.
6. **Atomic Symlink**: Swaps `$DEPLOY_ROOT/current` symlink.
7. **Image Pull & Caddy Auto-SSL Launch**: Pulls latest pre-built container image (`ghcr.io/workouse/bilo-bunker:latest`) and starts stack using `docker compose pull && docker compose up -d`. Caddy manages TLS certificates automatically.
8. **Health Check**: Polls `https://$DOMAIN/api/v1/health` until HTTP 200 OK is returned.
9. **Release Pruning**: Cleans up old releases, retaining the last 5 releases.

---

## 5. Alternative Deployment: Fly.io

For a managed cloud container deployment without VPS infrastructure, `packages/app` can be deployed directly to [Fly.io](https://fly.io).

### Step-by-Step Fly.io Deployment

1. **Install Fly CLI** and authenticate:
   ```bash
   fly auth login
   ```
2. **Navigate to the application package**:
   ```bash
   cd packages/app
   ```
3. **Initialize the Fly app**:
   ```bash
   fly launch --no-deploy
   ```
4. **Create a persistent volume** for SQLite storage:
   ```bash
   fly volumes create bunker_data --size 1 --region iad
   ```
5. **Configure environment secrets**:
   ```bash
   fly secrets set OWNER_PUBKEY=your_64_char_hex_pubkey DEFAULT_RELAYS=wss://relay.damus.io,wss://nos.lol
   ```
6. **Deploy**:
   ```bash
   fly deploy
   ```

---

## 6. Maintenance & Application Updates

To pull updates and deploy the latest version:

```bash
git pull origin main
make deploy
```

---

## 7. Database Backup & Recovery (`make backup`)

Bilo Bunker stores state and keys in a local SQLite database (`bunker.db`) at `/data/bunker.db`.

### Creating a Live Snapshot Backup

```bash
make backup
```

Produces a clean, transaction-consistent snapshot saved locally to `./backups/bunker_YYYYMMDD_HHMMSS.db`.

---

## 8. Troubleshooting Guide

| Component | Symptom / Issue | Possible Cause | Resolution |
|---|---|---|---|
| **App** | Healthcheck failing (`502 Bad Gateway` or `Connection Refused`) | `OWNER_PUBKEY` variable missing or invalid hex length | Check container logs: `docker compose logs app`. Ensure `.env` contains valid 64-char hex public key for `OWNER_PUBKEY`. |
| **Caddy / TLS** | HTTPS certificate errors or TLS challenge timeout | Port 80/443 blocked or DNS A-record not pointing to server IP | Ensure DNS A-record resolves to server IP and inbound ports 80/443 TCP/UDP are open in firewall. Check Caddy logs: `docker compose logs caddy`. |
| **Relay** | NIP-46 signing requests timed out | Outbound WebSocket connection failure or unreachable relay | View logs: `docker compose logs app \| grep "\[relay\]"`. Verify relay URLs start with `wss://`. |
| **DB** | SQLite locks or permission error | File permission error on `/data` volume | Ensure container user (`bunker`) has write ownership of `/data` directory volume. |

