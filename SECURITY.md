# Security

## Reporting a vulnerability

Please do not open a public issue. Email the platform owner (security contact of your organisation) with
the details and steps to reproduce. We aim to acknowledge within 2 working days.

## Controls in this repository (OWASP ASVS / Top 10 oriented)

| Area | Control |
|---|---|
| Authentication | Django session auth; Argon2id password hashing; minimum length 12 + common/numeric/similarity validators; session key rotated on login (no fixation); 8-hour sliding session. |
| Brute force | `django-axes` locks a username + IP after 5 failures for 15 minutes; DRF throttle 10/min on login; nginx `limit_req` on the login route; generic "invalid username or password" message. |
| CSRF | CSRF token required on every unsafe request, **including sign-in** (login CSRF); SPA sends it in `X-CSRFToken`; `CSRF_TRUSTED_ORIGINS` restricted. |
| Cookies | Session cookie `HttpOnly`, `SameSite=Lax`, `Secure` in production; CSRF cookie `Secure` in production. |
| Authorisation | Deny by default (`IsAuthenticated` + role check on every endpoint); roles viewer / editor / approver / admin; maker-checker enforced server-side (submitter cannot decide); HCM data read-only. |
| Input handling | DRF serializers validate every field; code / id formats enforced by regex; BPMN parsed with **defusedxml** (no DTDs, no external entities, no entity expansion), 2 MB limit; document links restricted to `https://`; JSON-only parsers. |
| Output / XSS | React escapes by default; `dangerouslySetInnerHTML` banned by ESLint; strict Content-Security-Policy (`script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`). |
| Transport & headers | HSTS (prod), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`; `server_tokens off`. |
| Secrets | Only from environment (`.env`, never committed); production refuses to start without a ≥50-char `DJANGO_SECRET_KEY`; no hard-coded passwords — demo accounts exist only when `XCORE_DEMO_PASSWORD` is set. |
| Errors & logging | Uniform error envelope, no stack traces to clients; structured logs to stdout with a request id; immutable audit trail of every change and decision. |
| Privacy | HCM data holds IDs only — no employee names or personal data. |
| Containers | Multi-stage builds, non-root users, read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, DB not exposed outside the compose network, health checks. |
| Supply chain | Exact version pins, `pip-audit` and `npm audit` in CI, Dependabot for pip / npm / Docker / Actions, least-privilege `GITHUB_TOKEN`. |

## Production checklist

- [ ] Terminate TLS in front of nginx; set `DJANGO_SECURE_COOKIES=true`, `DJANGO_HSTS_SECONDS=31536000`, `DJANGO_SSL_REDIRECT=true` (or redirect at the load balancer).
- [ ] Set `DJANGO_ALLOWED_HOSTS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to the real host name only.
- [ ] Generate a new `DJANGO_SECRET_KEY` and strong `POSTGRES_PASSWORD`; keep them in a secret manager.
- [ ] Leave `XCORE_DEMO_PASSWORD` empty; create named accounts (or connect SSO) and remove demo users.
- [ ] Change `DJANGO_ADMIN_URL` to a non-default path and restrict it at the network edge.
- [ ] Use a managed PostgreSQL with encryption at rest, automated backups and `POSTGRES_SSLMODE=require`.
- [ ] Ship logs to your SIEM; alert on `axes` lock-outs and 5xx rates.
- [ ] Run `python manage.py check --deploy` (CI does this) and a DAST scan (e.g. OWASP ZAP baseline) before go-live.
