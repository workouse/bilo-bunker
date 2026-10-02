# Contributing to Bilo Bunker

Thank you for your interest in contributing to **Bilo Bunker**! We welcome contributions from developers of all skill levels.

---

## 📜 Code of Conduct

Please maintain a respectful, welcoming, and inclusive community environment in all issue discussions, pull requests, and code reviews.

---

## 🛠️ Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/your-username/bilo-bunker.git
   cd bilo-bunker
   ```

2. **Ensure Node & pnpm are ready:**
   ```bash
   nvm use
   make install
   ```

3. **Start local development server:**
   ```bash
   make dev
   ```
   The backend listens on `PORT` (default `3000`); the Vite dev server runs on
   <http://localhost:5173> and proxies `/api` to the backend.

---

## 🔍 Debugging Tools

`packages/app/scripts/` contains small CLI helpers (run with `--help` for all options).
Pubkeys accept 64-char hex or `npub1…`; relays default to `DEFAULT_RELAYS`.

```bash
# Send a NIP-46 `connect` from an ephemeral client and print the response
pnpm --filter @bilo-bunker/app debug:nip46 -- --uri 'bunker://<pubkey>?relay=wss://...&secret=...'

# Make a NIP-98 authenticated API request (ephemeral key, or --nsec) and print the curl equivalent
pnpm --filter @bilo-bunker/app debug:nip98 -- --url http://localhost:3000/api/v1/bunker/logs

# Watch relays for NIP-46 traffic to a bunker and/or from a client
pnpm --filter @bilo-bunker/app debug:sniff -- --bunker <pubkey> [--client <pubkey>]
```

---

## 🧪 Quality Standards

Before submitting a Pull Request, ensure all quality checks pass cleanly:

```bash
# Must produce 0 errors
make typecheck

# Must produce 0 errors
make lint

# All tests must pass
make test

# Production build must succeed
make build
```

---

## 🤖 Domain Agents Reference

Refer to [`agents.md`](agents.md) to understand the domain responsibilities (`@agent-arch`, `@agent-nostr`, `@agent-ui`, `@agent-devops`) and architectural guidelines.
