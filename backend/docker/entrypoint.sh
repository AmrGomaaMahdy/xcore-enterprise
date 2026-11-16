#!/bin/sh
# Container start-up: wait for the database, migrate, optionally load the demo library.
set -eu

python - <<'PY'
import os, sys, time
import django
django.setup()
from django.db import connection
for attempt in range(30):
    try:
        connection.ensure_connection()
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001
        print(f"waiting for database ({attempt + 1}/30): {exc.__class__.__name__}", flush=True)
        time.sleep(2)
sys.exit("database not reachable")
PY

if [ "${DJANGO_MIGRATE:-true}" = "true" ]; then
  python manage.py migrate --noinput
fi

if [ "${XCORE_LOAD_DEMO:-false}" = "true" ]; then
  python manage.py load_demo_data
fi

exec "$@"
