# X-Core · Process Hub

**X-Core — The Business Excellence Platform.** This repository contains the first module, **Process Hub**:
one governed source for business processes, the KPIs that measure them, the services they deliver, and
the approvals that keep all of it trustworthy. (The second module, **Performance Center**, will consume
the same KPI library and is out of scope here.)

| Area | What you get |
|---|---|
| **Business Process Library** | L0 domain → L1 function → L2 sub-function → L3 process → L4 activities. BPMN 2.0 As-Is / To-Be models with an in-browser viewer and modeler (bpmn-js), versioning (Draft → In review → Approved → Retired), activities with system / automation / traceability, lanes mapped to Oracle Fusion HCM sub job families, RACI, segregation-of-duties checks, risks & controls, documents, a release-readiness checklist and full history. |
| **Enterprise KPI Library** | Five tiers (Strategic → Functional → Sub-functional → Process → Operational indicator), enforced naming convention, the five strategic objectives, calculation types (Measured, Derived, Gate, Direct), roll-up weights that must add up to 100, targets under maker-checker. |
| **KPI Alignment Matrix** | Objective ↔ function ↔ process ↔ KPI ↔ activity indicator, contribution % (product of weights along the path), explanatory drivers, line of sight. |
| **KPI hierarchy & cascade** | Interactive network (React Flow), filters by KPI name / domain / function / sub-function / process, details popup, full screen. Metadata only — no values. |
| **Activity automation map** | Heat map and list of L4 activities by automation level and traceability, with filters and detail popups. |
| **Service Catalog** | Catalog of services traced to activities and KPIs, plus a rule-based **generator** that proposes services from approved To-Be models (evidence-based, reuse before creation, no invented commitments, traceable, human-approved, schema-validated). |
| **Impact analysis** | "Where used" for an activity, process, KPI, sub job family or system before you change it. |
| **Approvals & audit** | Maker-checker queue for model versions, KPI targets and services; immutable audit trail. |
| **Sign-in** | Animated network background, glass card, session cookie + CSRF, lockout after repeated failures. |

---

## Quick start (Docker)

Requirements: Docker 24+ with Compose v2.

```bash
git clone https://github.com/<your-org>/xcore-platform.git
cd xcore-platform
cp .env.example .env
# edit .env: set DJANGO_SECRET_KEY, POSTGRES_PASSWORD and (for a demo) XCORE_DEMO_PASSWORD
docker compose up -d --build
```

Open **http://localhost:8080**.

With `XCORE_LOAD_DEMO=true` the prototype library is loaded on first start (13 nodes, 5 BPMN versions,
34 KPIs, 36 targets, 3 services, 3 pending approvals). If `XCORE_DEMO_PASSWORD` is set, four demo
sign-ins are created with that password:

| Username | Role | Can |
|---|---|---|
| `xcore.viewer` | Viewer | read everything |
| `process.editor` | Editor | maintain processes, KPIs, services; submit for approval |
| `process.approver` | Approver | everything an editor can, plus approve / reject others' requests |
| `xcore.admin` | Admin | everything, plus Django admin |

For a real environment leave `XCORE_DEMO_PASSWORD` empty and create an administrator:

```bash
docker compose exec backend python manage.py createsuperuser
```

Useful commands (`make help` lists them all): `make up`, `make logs`, `make demo` (reload demo data),
`make superuser`, `make clean` (removes the database volume).

API documentation (OpenAPI / Swagger UI, signed-in users only): **http://localhost:8080/api/v1/docs/**

## Local development without Docker

```bash
# backend (Python 3.12+)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DJANGO_SETTINGS_MODULE=config.settings.dev DB_ENGINE=sqlite XCORE_DEMO_PASSWORD='Choose-A-Demo-Passw0rd'
python manage.py migrate && python manage.py load_demo_data
python manage.py runserver          # http://localhost:8000

# frontend (Node 20+), in a second terminal
cd frontend
npm ci
npm run dev                          # http://localhost:5173 (proxies /api to :8000)
```

Or run both with live reload in containers: `make dev`.

## Tests & quality gates

```bash
make test         # ruff + pytest (backend) · tsc + eslint + vitest (frontend)
```

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR: lint and format checks, migrations
check, tests on PostgreSQL 16, `manage.py check --deploy` against production settings, `pip-audit` and
`npm audit`, the production build, then builds both images and smoke-tests the composed stack.
Dependabot keeps pip, npm, Docker base images and Actions up to date.

## Repository layout

```
backend/                Django 5.2 + Django REST Framework API
  config/settings/      base · dev · prod · test
  apps/core/            audit trail, permissions, error envelope, health, overview, demo loader
  apps/accounts/        user + roles, session sign-in / sign-out
  apps/hcm/             read-only Oracle Fusion HCM job architecture (IDs only)
  apps/processes/       process library, BPMN parsing (defusedxml), versions, activities, lanes, risks, docs
  apps/kpis/            KPI library, links & weights, targets, calculation & alignment engine
  apps/catalog/         service catalog + rule-based service generator
  apps/governance/      maker-checker approvals, impact analysis, audit API
  fixtures/demo/        the prototype library (process data + HCM sync snapshot)
  tests/                pytest suite
frontend/               React 18 + TypeScript + Vite SPA
  src/api/              typed client (CSRF, error envelope) + React Query hooks
  src/auth/ src/theme/  session context, four global themes
  src/components/       app shell, shared UI
  src/pages/            sign-in, overview, library, KPIs, catalog, impact, approvals, audit …
  nginx/                hardened nginx config (CSP, security headers, /api proxy)
docs/                   architecture, API notes
docker-compose.yml      PostgreSQL + API + web (production-like)
docker-compose.dev.yml  live-reload overrides
```

## Publishing to GitHub

```bash
cd xcore-platform
git init -b main            # skip if the folder already has a .git directory
git add . && git commit -m "Initial import of X-Core Process Hub"
gh repo create <your-org>/xcore-platform --private --source . --push
# or: git remote add origin git@github.com:<your-org>/xcore-platform.git && git push -u origin main
```

Then in the repository settings: protect `main` (require the CI checks and one review), enable
Dependabot security updates, secret scanning and push protection.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — domain model, rules, request flow, decisions
- [SECURITY.md](SECURITY.md) — controls in place and the production checklist
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding standards, branching, commit and review rules
