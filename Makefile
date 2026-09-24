# Developer shortcuts. Each target is a thin wrapper, so the commands also work by hand.
# On Windows, run from Git Bash with GNU Make installed (e.g. `winget install ezwinports.make`).

.DEFAULT_GOAL := help
.PHONY: help setup dev db down reset-db test test-backend test-pipeline test-web \
        lint lint-backend lint-pipeline lint-web format

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

setup: ## Install toolchain dependencies and create .env
	./scripts/dev-setup.sh

dev: ## Run Postgres, API and web app in Docker
	docker compose up --build

db: ## Run only Postgres in the background
	docker compose up -d postgres

down: ## Stop all containers
	docker compose down

reset-db: ## Delete the local database volume
	docker compose down --volumes

test: test-backend test-pipeline test-web ## Run every test suite

test-backend:
	dotnet test backend/IxnosData.slnx

test-pipeline:
	cd pipeline && uv run pytest

test-web:
	cd web && pnpm typecheck

lint: lint-backend lint-pipeline lint-web ## Run every linter

lint-backend:
	dotnet format backend/IxnosData.slnx --verify-no-changes

lint-pipeline:
	cd pipeline && uv run ruff check . && uv run ruff format --check . && uv run mypy src tests

lint-web:
	cd web && pnpm lint

format: ## Auto-format .NET and Python code
	dotnet format backend/IxnosData.slnx
	cd pipeline && uv run ruff check --fix . && uv run ruff format .
