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
   This starts the backend API on `http://localhost:3000` and the Vite UI on `http://localhost:5173` (open this one). Vite proxies `/api` to the backend; point it elsewhere with `VITE_DEV_API_TARGET`.

---

## 🔍 Debugging Tools

`packages/app/scripts/` has three small CLI tools (run with `--help` for all options):

```bash
# End-to-end NIP-46 check: send `connect` to a bunker via its relays and wait for the reply
pnpm --filter @bilo-bunker/app debug:nip46 --bunker 'bunker://<pubkey>?relay=wss://relay.damus.io'

# Call the API with a NIP-98 auth header (throwaway key, or --nsec to act as a user) and print a curl command
pnpm --filter @bilo-bunker/app debug:nip98 --url http://localhost:3000/api/v1/bunker/uri

# Watch relays for events addressed to (--p) or signed by (--author) a pubkey
pnpm --filter @bilo-bunker/app debug:sniff --p <bunker-pubkey> --relay wss://relay.damus.io
```

`debug:nip46` registers its throwaway client on the bunker; revoke it from the dashboard afterwards if needed.

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
