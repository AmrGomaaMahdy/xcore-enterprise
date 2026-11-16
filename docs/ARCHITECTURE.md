# Architecture

## 1. Context

```
            ┌──────────── browser (React SPA) ─────────────┐
            │  same origin: https://xcore.example.com       │
            └──────────────┬────────────────────────────────┘
                           │  HTTPS (TLS at load balancer / ingress)
                  ┌────────▼────────┐
                  │  nginx (web)    │  static SPA · CSP & security headers · /api proxy · login rate limit
                  └────────┬────────┘
                           │ http (internal network)
                  ┌────────▼────────┐
                  │ Django + DRF    │  gunicorn · session auth + CSRF · RBAC · audit · OpenAPI
                  └────────┬────────┘
                           │
                  ┌────────▼────────┐        nightly sync (future connector)
                  │ PostgreSQL 16   │ ◄──────────────────────────── Oracle Fusion HCM
                  └─────────────────┘
```

The SPA and the API share one origin, so the session cookie can stay `HttpOnly` + `SameSite=Lax` and no
CORS is needed. Containers run as non-root, read-only, with all Linux capabilities dropped.

## 2. Backend modules (Django apps)

| App | Responsibility | Key objects |
|---|---|---|
| `core` | Cross-cutting: audit trail, RBAC permissions, error envelope, request id, health, overview, demo loader | `AuditEntry`, `TimeStampedModel`, `DomainError` |
| `accounts` | Login identity and role | `User(role = viewer/editor/approver/admin)` |
| `hcm` | Read-only copy of the Fusion HCM job architecture | `BusinessUnit`, `JobFamily`, `SubJobFamily`, `Job`, `Employee` |
| `processes` | Business Process Library | `ProcessNode` (L0–L3), `ProcessVersion` (BPMN XML), `Activity` (L4), `Lane`, `Risk`, `ProcessDocument` |
| `kpis` | Enterprise KPI Library + alignment | `StrategicObjective`, `Kpi`, `KpiLink`, `KpiTarget`, `engine.Snapshot` |
| `catalog` | Service catalog + generator | `Service`, `generator.RuleBasedGenerator` |
| `governance` | Approvals, impact analysis, audit API | `ApprovalRequest`, `services.decide`, `impact.analyse` |

Dependency direction: `core ← accounts, hcm ← processes ← kpis ← catalog ← governance`.
Views are thin; business rules live in `services.py` / `engine.py` / `impact.py` so they are unit-testable
and reusable from management commands or a future message consumer.

## 3. Domain rules implemented

**Process hierarchy.** L0 domain → L1 function → L2 sub-function → L3 process → L4 activity. The
serializer enforces that an L*n* node sits under an L*n-1* node. Codes: 2–20 upper-case characters.

**Versions.** Each L3 process has As-Is and To-Be BPMN 2.0 models. Life cycle: Draft → In review →
Approved → Retired. Only one open draft per kind. Only drafts can be edited or discarded. Approving a
version retires the previously approved version of the same kind; approving a To-Be re-syncs the L4
activities (new tasks are added, names/lanes/types refreshed, removed tasks flagged `in_current_model =
false`, enrichment kept).

**Activities.** Identity (id, name, BPMN type, lane, sub-process) comes from the model. System,
automation, traceability, steps and data are maintained in X-Core. BPMN `serviceTask`, `scriptTask`
and `businessRuleTask` are always *Automated*; `manualTask` is always *Manual*.

**Lanes = sub job families.** Every lane maps to an Oracle Fusion HCM sub job family (or is an external
party). Every employee carries a mandatory sub job family, which belongs by default to its job family —
so activities, KPIs and RACI cascade to people without jobs or positions. The accountable process owner
is a job (`owner_job`).

**Segregation of duties.** Rules in `settings.XCORE["SOD_RULES"]`, e.g. *Release PO* (T-030-02) and
*3-way match* (T-030-16) must not sit in the same sub job family.

**KPI tiers and naming.**

| Tier | Level | Id pattern | Owner node |
|---|---|---|---|
| Strategic objective | – | `OBJ-nn` | – |
| Enterprise outcome | 0 | `ENT-KPI-nn` | any L0 |
| Strategic KPI | 0 | `<domain>-KPI-nn` | L0 |
| Functional KPI | 1 | `<function>-KPI-nn` | L1 |
| Sub-functional KPI | 2 | `<sub-function>-KPI-nn` | L2 |
| Process KPI | 3 | `<process>-KPI-nn` | L3 |
| Operational indicator | 4 | `<process>-OI-nn` | L3 |

**Calculation types.** *Measured* on one or two L4 activities (from → to). *Derived*: weighted average
of contributors, weights add up to 100. *Gate*: worst contributor. *Direct*: measured at its own level and
explained by drivers (explained-by links). Scoring: higher-is-better = actual ÷ target, lower-is-better =
target ÷ actual, capped at 100. Health: on target / watch / below from the green and amber thresholds.

**Alignment.** Contribution of a KPI to an objective = product of the roll-up weights along the path.
Explained-by links are shown as *driver* (influence, not arithmetic). The enterprise outcome (OBJ-05,
ENT-KPI-01) is the result of OBJ-01…04 and is kept off the cascade network.

**Maker-checker.** Process versions, KPI targets and services are submitted (status *In review*) and
decided by an approver who is not the submitter. Rejection needs a reason and returns the item to
Draft. Exactly one pending request per item (database constraint).

**Service generator.** Pluggable (`settings.XCORE["SERVICE_GENERATOR"]`). The default backend matches a
curated pattern library against the approved To-Be activities (fuzzy matching), checks the catalog for
reuse, flags missing owners/SLAs instead of inventing them, links proposed measures to library KPIs and
returns schema-validated candidates. Adopting a candidate creates a *Draft* service only.

## 4. API conventions

- Base path `/api/v1/`; OpenAPI schema at `/api/v1/schema/`, Swagger UI at `/api/v1/docs/` (signed-in only).
- JSON only. Lists are unpaginated unless `?page=` is passed (`page_size` ≤ 500).
- Filtering with query parameters (`?process__code=15-030&automation=Automated`), `?search=` on text.
- Natural keys in URLs where users think in codes: `/processes/nodes/15-030/`, `/kpis/library/PRO-KPI-01/`.
- Errors always use one envelope: `{"error": {"code": "...", "message": "...", "details": {...}}}`.
  Validation → 400, unauthenticated → 403/401, business-rule conflict (`DomainError`) → 409.

Main endpoints:

| Area | Endpoints |
|---|---|
| Auth | `GET auth/csrf/` · `POST auth/login/` · `POST auth/logout/` · `GET auth/me/` |
| Library | `processes/nodes/` (+ `tree/`, `{code}/raci/`, `quality/`, `sod/`, `history/`) · `processes/versions/` (+ `new-draft/`, `model/`, `submit/`, `export/`, `parsed/`) · `processes/activities/` (+ `heatmap/`) · `processes/lanes/` · `processes/risks/` · `processes/documents/` · `processes/search/` |
| KPIs | `kpis/objectives/` · `kpis/library/` (+ `{id}/weights/`, `{id}/calculation/`) · `kpis/links/` · `kpis/targets/` (+ `submit/`) · `kpis/alignment/` · `kpis/cascade/` |
| Catalog | `catalog/services/` (+ `submit/`) · `catalog/generator/?process=` · `catalog/generator/{code}/adopt/` |
| Governance | `governance/approvals/` (+ `approve/`, `reject/`, `withdraw/`) · `governance/impact/?type=&ref=` · `governance/audit/` |
| HCM | `hcm/business-units/` · `hcm/job-families/` · `hcm/sub-job-families/` · `hcm/jobs/` · `hcm/employees/` |
| Ops | `health/` (public) · `overview/` |

## 5. Frontend

- React 18 + TypeScript (strict) + Vite; React Router; TanStack Query for server state (no global store).
- `src/api/client.ts` is the only place that talks HTTP: same-origin, CSRF header on unsafe methods,
  normalised errors. Pages use typed hooks from `src/api/hooks.ts`.
- Routes are lazy-loaded; bpmn-js and React Flow are split into their own chunks.
- Four global themes (Classic light, Desert gold, Azure sky, Dark) as CSS custom properties on `<html data-theme>`.
- No `dangerouslySetInnerHTML` (lint rule). BPMN XML is rendered by bpmn-js as SVG.

## 6. Integration points (next steps)

- **Oracle Fusion HCM**: replace the demo snapshot with a scheduled import (HCM Extracts or REST) into the
  `hcm` app; the tables are already read-only through the API.
- **Performance Center** (module 2): reads `kpis/library`, `kpis/alignment` and targets; writes actuals
  through a dedicated ingestion endpoint (the `actual` fields on `Kpi` are placeholders for that).
- **SSO**: add `mozilla-django-oidc` (Entra ID / Okta) next to session auth; roles from IdP groups.
- **LLM service generator**: implement a class with `generate(process, version) -> list[Candidate]`
  and point `XCORE["SERVICE_GENERATOR"]` at it — the governance flow stays unchanged.
