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
