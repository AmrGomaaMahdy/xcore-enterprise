# syntax=docker/dockerfile:1.7
# ---------- build stage: compile wheels, no compilers in the final image
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt

# ---------- runtime stage
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    PORT=8000
RUN groupadd --system --gid 10001 xcore \
 && useradd --system --uid 10001 --gid xcore --home-dir /app --shell /usr/sbin/nologin xcore
WORKDIR /app
COPY --from=build /wheels /wheels
RUN pip install --no-index --find-links=/wheels /wheels/* && rm -rf /wheels
COPY --chown=xcore:xcore . .
RUN chmod +x docker/entrypoint.sh \
 && DJANGO_SECRET_KEY=build-only-not-secret-build-only-not-secret-build-only-xx DB_ENGINE=sqlite \
    python manage.py collectstatic --noinput -v0 \
 && chown -R xcore:xcore /app/staticfiles
USER xcore
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/', timeout=4).status == 200 else 1)"
ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--threads", "2", "--timeout", "60", "--access-logfile", "-", "--forwarded-allow-ips", "*"]
