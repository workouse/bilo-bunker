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
curl -fsSL https://bunker.workouse.com/install.sh | bash
```

Or via GitHub fallback:
```bash
curl -fsSL https://raw.githubusercontent.com/workouse/bilo-bunker/master/scripts/install.sh | bash
```

Or run locally via Makefile:
```bash
make install-remote
```

The installer installs to `~/bunker` (fully compatible with Rootless Docker and non-root users), prompts for mode (**Multi-User** with `npub1...`/hex or **Single-User** with `nsec1...`/hex), downloads production compose configurations, pulls the pre-built Docker image (`ghcr.io/workouse/bilo-bunker:latest`), and launches the stack with auto-renewing Let's Encrypt TLS certificates. Re-running the command automatically updates an existing installation.

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

## 3. Local Environment Setup (`make blackstart`)

To interactively generate a `.env` configuration file on your machine or VPS:

```bash
make blackstart
```

The setup script (`scripts/blackstart.sh`) will prompt you for:
- **Operating Mode** (Multi-User with optional `OWNER_PUBKEY` vs Single-User with `OWNER_NSEC`; see [Operating Modes](README.md#-operating-modes))
- **Primary Domain** (`DOMAIN` — e.g. `bunker.example.com` or `localhost`)
- **Email Address** (`CERTBOT_EMAIL` for TLS certificate registration)
- **Default Relays** (comma-separated `wss://` URLs)

---

## 4. Alternative Deployment: Fly.io

For a managed cloud container deployment without VPS infrastructure, Bilo Bunker can be deployed to [Fly.io](https://fly.io) using the same root `Dockerfile` as the Docker image (backend + dashboard).

### Step-by-Step Fly.io Deployment

1. **Install Fly CLI** and authenticate:
   ```bash
   fly auth login
   ```
2. **From the repository root**, initialize the Fly app (Fly picks up the root `Dockerfile`):
   ```bash
   fly launch --no-deploy
   ```
3. **Create a persistent volume** for SQLite storage:
   ```bash
   fly volumes create bunker_data --size 1 --region iad
   ```
4. **Mount the volume at `/data`** by adding this to the generated `fly.toml` (without it, the database and the bunker keys are lost on every deploy):
   ```toml
   [mounts]
     source = "bunker_data"
     destination = "/data"
   ```
5. **Configure environment secrets**:
   ```bash
   fly secrets set OWNER_PUBKEY=npub1yourpublickey DEFAULT_RELAYS=wss://relay.damus.io,wss://nos.lol
   ```
   For single-user mode set `OWNER_NSEC` instead (see [Operating Modes](README.md#-operating-modes)).
6. **Deploy**:
   ```bash
   fly deploy
   ```

---

## 5. Maintenance & Application Updates

### Option 1: Quick Update Command
Inside your installation directory (`~/bunker`), run:
```bash
~/bunker/update.sh
```

### Option 2: Re-run Installer
```bash
curl -fsSL https://bunker.workouse.com/install.sh | bash
```
The installer automatically detects the existing installation, preserves `.env` and database volumes, pulls the newest container image, and recreates the services.

### Option 3: Manual Docker Compose Pull
```bash
docker compose pull && docker compose up -d
```

---

## 6. Database Backup & Recovery (`make backup`)

Bilo Bunker stores state and keys in a local SQLite database (`bunker.db`) at `/data/bunker.db`.

### Creating a Live Snapshot Backup

```bash
make backup
```
Inside `~/bunker`, you can also run `./backup.sh`.

Produces a clean, transaction-consistent snapshot saved to `./backups/bunker_YYYYMMDD_HHMMSS.db`.

---

## 7. Troubleshooting Guide

| Component | Symptom / Issue | Possible Cause | Resolution |
|---|---|---|---|
| **App** | Healthcheck failing (`502 Bad Gateway` or `Connection Refused`) | App container crashed or is still starting | Check container logs: `docker compose logs app`. |
| **App** | Wrong operating mode, or owner not recognised | `OWNER_NSEC` set when you meant multi-user (it always wins), or an invalid `OWNER_PUBKEY` / `OWNER_NSEC` value (silently ignored) | Check the startup log line `[bunker] Operating in … MODE`. Keys must be `npub1…`/`nsec1…` or 64-char hex. See [Operating Modes](README.md#-operating-modes). |
| **Caddy / TLS** | HTTPS certificate errors or TLS challenge timeout | Port 80/443 blocked or DNS A-record not pointing to server IP | Ensure DNS A-record resolves to server IP and inbound ports 80/443 TCP/UDP are open in firewall. Check Caddy logs: `docker compose logs caddy`. |
| **Dashboard** | Logged in, but keypair stays on "Generating...", no QR code, new connections don't appear (API returns `401 NIP-98 URL mismatch`) | A custom reverse proxy (e.g. Nginx Proxy Manager) terminates TLS but the app sees `http://` or a different host | Make the proxy forward the `Host` header and set `X-Forwarded-Proto`, or set `PUBLIC_URL=https://your.domain` in the app environment. |
| **Relay** | NIP-46 signing requests timed out | Outbound WebSocket connection failure or unreachable relay | View logs: `docker compose logs app \| grep "\[relay\]"`. Verify relay URLs start with `wss://`. |
| **DB** | SQLite locks or permission error | File permission error on `/data` volume | Ensure container user (`bunker`) has write ownership of `/data` directory volume. |

