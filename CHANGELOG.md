# Changelog

## v1.2.0 — 2026-11-17

### Added
- **Render deployment:** `render.yaml` Blueprint (PostgreSQL + one Docker web service) and
  `Dockerfile.render`, which bundles the React app into the Django image (single HTTPS origin).
- `DATABASE_URL` support, automatic `RENDER_EXTERNAL_HOSTNAME` in allowed hosts / CSRF origins.
- Django serves the SPA (deep links → `index.html`, WhiteNoise for hashed assets) when `XCORE_SPA_DIR` is set.
- `SecurityHeadersMiddleware` (CSP, Permissions-Policy) for deployments without nginx.
- `HealthCheckMiddleware`: health probe answered before host validation and HTTPS redirects.
- `ensure_admin` command: creates the administrator from `XCORE_ADMIN_USERNAME` / `XCORE_ADMIN_PASSWORD`
  (works on hosts without a shell).
- Client IP for lock-outs read from `X-Forwarded-For` behind the Render edge (`XCORE_PROXY_COUNT`).

### Changed
- Production secret key minimum is 40 characters (Render generates 44).

## v1.1.0 — 2026-11-17

### Fixed
- **KPI hierarchy & cascade:** hovering a KPI no longer makes the network flicker or shake. Nodes no longer
  move or scale on hover/focus (focus is shown with colour, a glow ring and dimming only), hover changes are
  debounced so moving across neighbouring KPIs is smooth, and edges only animate on the focused path.

### Changed
- **Header:** larger, gradient *Process Hub* module title with a gentle colour flow; clearer, larger X-Core
  mark and Al-Ayuni logo (logo cropped of transparent padding, shown on a white tile), both with a subtle
  light-sweep animation (disabled for users who prefer reduced motion).
- Version shown at the bottom of the side menu.

### Removed
- **Service Catalog** page and menu entry (the catalog API and generator remain in the backend).
- **API docs** button in the header (Swagger UI is still available at `/api/v1/docs/` for signed-in users).

## v1.0.0 — 2026-11-17

- Initial Process Hub: Business Process Library, Enterprise KPI Library, KPI Alignment Matrix, KPI
  hierarchy & cascade, Process Governance (approvals, impact analysis, audit trail), Docker and CI.
- Redesigned home, repository tree with add-child actions, BPMN zoom / compare / new version / export,
  risk heat map, quality gauge, KPI focus mode, governance workspace.
