SHELL := /bin/bash

NVM_RUN := source ~/.nvm/nvm.sh 2>/dev/null || true; nvm use 2>/dev/null || true;

.PHONY: all install blackstart dev build lint typecheck test deploy deploy-remote install-remote clean \
        docker-build docker-run-single docker-run-multi docker-up docker-down docker-logs docker-shell docker-restart \
        backup

all: build

install:
	@$(NVM_RUN) pnpm install

blackstart:
	@bash scripts/blackstart.sh

dev:
	@$(NVM_RUN) pnpm dev

build:
	@$(NVM_RUN) pnpm build

lint:
	@$(NVM_RUN) pnpm lint

typecheck:
	@$(NVM_RUN) pnpm typecheck

test:
	@$(NVM_RUN) pnpm test

deploy:
	@bash scripts/deploy.sh

deploy-remote:
	@bash scripts/deploy.sh

install-remote:
	@bash scripts/install.sh


docker-build:
	docker build -t ghcr.io/workouse/bilo-bunker:latest .

docker-run-single:
	docker run -d --name bilo-bunker -p 3000:3000 -v $(PWD)/data:/data -e OWNER_NSEC=$(OWNER_NSEC) ghcr.io/workouse/bilo-bunker:latest

docker-run-multi:
	docker run -d --name bilo-bunker -p 3000:3000 -v $(PWD)/data:/data -e OWNER_NPUB=$(OWNER_NPUB) ghcr.io/workouse/bilo-bunker:latest

docker-up:
	docker compose up -d


docker-down:
	docker compose down

docker-logs:
	docker compose logs -f

docker-shell:
	docker compose exec app sh

docker-restart:
	docker compose restart

backup:
	@mkdir -p backups
	@TIMESTAMP=$$(date +%Y%m%d_%H%M%S); \
	echo "Creating database backup..."; \
	docker compose exec app node -e "const Database = require('better-sqlite3'); const db = new Database(process.env.DB_PATH || '/data/bunker.db'); db.backup('/data/bunker_backup.db').then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });" && \
	docker compose cp app:/data/bunker_backup.db ./backups/bunker_$${TIMESTAMP}.db && \
	docker compose exec app rm -f /data/bunker_backup.db && \
	echo "Backup created: backups/bunker_$${TIMESTAMP}.db"

clean:
	rm -rf node_modules packages/*/node_modules packages/*/dist .wrangler nginx/nginx.conf
