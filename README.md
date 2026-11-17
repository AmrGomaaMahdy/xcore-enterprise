# X-Core · Process Hub

**Version 1.2** — see [CHANGELOG.md](CHANGELOG.md).

**X-Core — The Business Excellence Platform.** This repository contains the first module, **Process Hub**:
one governed source for business processes, the KPIs that measure them, the services they deliver, and
the approvals that keep all of it trustworthy. (The second module, **Performance Center**, will consume
the same KPI library and is out of scope here.)

| Area | What you get |
|---|---|
| **Home** | Hero dashboard: process quality and traceability rings, hierarchy strip, the three repositories, process portfolio with quality scores, governance snapshot, automation donut, domains and recent changes. |
| **Business Process Library** | Redesigned repository tree (level icons, counts, search highlight, inline “+” to add a function / sub-function / process, “+ Domain”), node header with an *Add …* button per level. L0 domain → L1 function → L2 sub-function → L3 process → L4 activities. BPMN 2.0 As-Is / To-Be models with an in-browser viewer and modeler (bpmn-js) — zoom in / out / 100 % / fit, colour by task type, side-by-side version compare with highlighted added / changed / removed activities, *New version* from any approved model, export to .bpmn / .xml / .svg / .png and an XML source view; risk heat map (likelihood × impact) with status and control charts; quality gauge with score by area, versioning (Draft → In review → Approved → Retired), activities with system / automation / traceability, lanes mapped to Oracle Fusion HCM sub job families, RACI, segregation-of-duties checks, risks & controls, documents, a release-readiness checklist and full history. |
| **Enterprise KPI Library** | Five tiers (Strategic → Functional → Sub-functional → Process → Operational indicator), enforced naming convention, the five strategic objectives, calculation types (Measured, Derived, Gate, Direct), roll-up weights that must add up to 100, targets under maker-checker. |
| **KPI Alignment Matrix** | Objective ↔ function ↔ process ↔ KPI ↔ activity indicator, contribution % (product of weights along the path), explanatory drivers, line of sight. |
| **KPI hierarchy & cascade** | Animated network (React Flow): hover or click a KPI to light up its full path — upstream KPIs in gold, contributing KPIs in teal, everything else dimmed — with a side panel showing the path to the top, contributors by tier and the definition. Filters by KPI name / domain / function / sub-function / process, mini-map, full screen. Metadata only — no values. |
| **Service catalog (API only)** | The catalog page was removed from the UI in v1.1. The service records, the rule-based service generator and their approvals remain available through the API (`/api/v1/catalog/…`) for future use. |
| **Impact analysis** | "Where used" for an activity, process, KPI, sub job family or system before you change it. |
| **Process Governance** | Governance & approvals workspace at the top of the menu: decision queue with ageing and overdue flags, filters by type and process, lifecycle stepper, decision context (activity diff against the live model, quality checks, proposed vs. live target), approve / reject with notes, withdraw, governance policy; plus impact analysis and the immutable audit trail. |
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

API documentation (OpenAPI / Swagger UI, signed-in users only) is served at **http://localhost:8080/api/v1/docs/** — it is no longer linked from the app header.

## Deploy to Render (Blueprint)

The repository contains a [Render Blueprint](https://render.com/docs/blueprint-spec) (`render.yaml`) that
creates everything in one step:

| Resource | What it is |
|---|---|
| `xcore-db` | Managed PostgreSQL 16 (Frankfurt, private network only) |
| `xcore-process-hub` | One Docker web service built from `Dockerfile.render`: the React app and the Django API on the same HTTPS origin, health-checked on `/api/v1/health/` |

Steps:

1. Push this repository to GitHub (see *Publishing to GitHub* below).
2. In Render: **New → Blueprint**, connect the repository, and keep the blueprint path `render.yaml`.
3. Render asks for two secrets:
   - `XCORE_ADMIN_PASSWORD` — the password of the `admin` account (12+ characters, not common, not all digits).
   - `XCORE_DEMO_PASSWORD` — fill it to create the four demo sign-ins (`process.editor`, `process.approver`,
     `xcore.viewer`, `xcore.admin`); leave it empty for production.
4. Click **Apply**. The first deploy builds the image (≈5–8 minutes), runs the migrations, creates the
   administrator and loads the demo library. Open the `https://xcore-process-hub.onrender.com` URL Render shows.

Good to know:

- `DJANGO_SECRET_KEY` is generated by Render; the database URL is wired automatically.
- The service redeploys on every push to the connected branch (`autoDeploy: true`).
- Plans default to the smallest paid instances. For a short trial set both `plan:` values to `free`
  (free web services sleep when idle; free databases expire).
- Custom domain: add it in Render, then add it to `DJANGO_ALLOWED_HOSTS` and
  `DJANGO_CSRF_TRUSTED_ORIGINS` (as `https://your.domain`).
- Django admin is at `/manage-xcore/` (set by `DJANGO_ADMIN_URL`).
- Security headers that nginx adds in the Compose setup (CSP, frame and referrer policies) are added by
  Django in this mode, and hashed frontend assets are cached for a year.

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
