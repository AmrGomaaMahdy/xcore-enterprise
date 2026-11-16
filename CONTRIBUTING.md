# Contributing & coding standards

## Workflow

- `main` is always deployable and protected: changes arrive by pull request with green CI and one review.
- Branch names: `feat/<short-topic>`, `fix/<short-topic>`, `chore/<short-topic>`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(kpis): validate weight totals`.
- Every PR states *what* and *why*, lists migrations, and includes tests for new rules.

## Backend (Python / Django)

- Python 3.12+, Django 5.2 LTS, DRF. Formatting and linting with **ruff** (`ruff format`, `ruff check`) — config in `backend/pyproject.toml`.
- One Django app per bounded context; apps depend only "downwards" (see docs/ARCHITECTURE.md).
- **Thin views, rich services**: business rules go in `services.py` / `engine.py`; views orchestrate and serialize.
- Business-rule violations raise `apps.core.exceptions.DomainError` (HTTP 409 with the error envelope); field problems raise serializer `ValidationError` (400).
- Every write that matters goes through `apps.core.audit.record` (ViewSets get it from `AuditedViewSetMixin`).
- Models: explicit `ordering`, `UniqueConstraint` / `CheckConstraint` for invariants, `TextChoices` for enums, `TimeStampedModel` for business records.
- Never trust the client for permissions; check roles server-side. Never parse XML without defusedxml.
- Migrations are committed and reviewed; CI fails if `makemigrations --check` finds changes.
- Tests with pytest + pytest-django in `backend/tests/`; name them after the behaviour (`test_maker_cannot_check`).

## Frontend (TypeScript / React)

- TypeScript `strict`, no `any` (lint error). Formatting with **Prettier**, linting with **ESLint** (`npm run lint`).
- Server state through TanStack Query hooks in `src/api/hooks.ts`; HTTP only through `src/api/client.ts`.
- Components are function components with hooks; pages under `src/pages/<area>/`, shared UI in `src/components/`.
- Styling with the CSS custom properties in `src/styles/global.css`; every colour must work in all four themes.
- Accessibility: semantic elements, labels on every input, `aria-*` on icon-only buttons, keyboard-closable dialogs.
- No `dangerouslySetInnerHTML`, no `eval`, no secrets or tokens in the bundle or in `localStorage`.

## Definition of done

- [ ] Lint, format, type-check and tests pass locally (`make test`).
- [ ] New rules have tests; new endpoints appear correctly in `/api/v1/docs/`.
- [ ] Docs updated (README / ARCHITECTURE) when behaviour or configuration changes.
- [ ] No new `npm audit` / `pip-audit` findings.
