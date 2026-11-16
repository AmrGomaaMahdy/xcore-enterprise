# Common tasks. Run `make help`.
.PHONY: help up down logs build dev demo superuser test lint fmt backend-test frontend-test clean

help:  ## show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.env:
	cp .env.example .env && echo "Created .env — edit the CHANGE_ME values"

up: .env  ## build and start the full stack on http://localhost:8080
	docker compose up -d --build

down:  ## stop the stack (data volume kept)
	docker compose down

logs:  ## follow logs
	docker compose logs -f --tail=100

dev: .env  ## development stack with live reload (API :8000, UI :5173)
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

demo:  ## (re)load the demo library into the running stack
	docker compose exec backend python manage.py load_demo_data --reset

superuser:  ## create an administrator account
	docker compose exec backend python manage.py createsuperuser

backend-test:  ## backend lint + tests (local venv)
	cd backend && ruff check . && ruff format --check . && pytest

frontend-test:  ## frontend typecheck + lint + tests
	cd frontend && npm run typecheck && npm run lint && npm test

test: backend-test frontend-test  ## all checks

fmt:  ## auto-format both code bases
	cd backend && ruff format . && ruff check --fix .
	cd frontend && npm run format

clean:  ## remove containers AND the database volume
	docker compose down -v
