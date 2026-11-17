import pytest
from rest_framework.test import APIClient

from .conftest import PASSWORD


@pytest.mark.django_db
def test_api_requires_authentication(demo):
    assert APIClient().get("/api/v1/processes/nodes/").status_code in (401, 403)


@pytest.mark.django_db
def test_health_is_public(db):
    r = APIClient().get("/api/v1/health/")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


@pytest.mark.django_db
def test_session_login_with_csrf(demo):
    c = APIClient(enforce_csrf_checks=True)
    c.get("/api/v1/auth/csrf/")
    token = c.cookies["xcore_csrftoken"].value
    r = c.post("/api/v1/auth/login/", {"username": "process.editor", "password": PASSWORD}, format="json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200
    assert r.json()["role"] == "editor"
    assert c.get("/api/v1/auth/me/").json()["can_edit"] is True


@pytest.mark.django_db
def test_login_without_csrf_is_rejected(demo):
    c = APIClient(enforce_csrf_checks=True)
    r = c.post("/api/v1/auth/login/", {"username": "process.editor", "password": PASSWORD}, format="json")
    assert r.status_code == 403


@pytest.mark.django_db
def test_wrong_password_gives_generic_message(demo):
    r = APIClient().post("/api/v1/auth/login/", {"username": "process.editor", "password": "nope"}, format="json")
    assert r.status_code == 400
    assert r.json()["error"]["message"] == "Invalid username or password."


@pytest.mark.django_db
def test_viewer_cannot_write(viewer):
    r = viewer.patch("/api/v1/processes/nodes/15-030/", {"name": "x"}, format="json")
    assert r.status_code == 403


@pytest.mark.django_db
def test_lockout_after_repeated_failures(demo, settings):
    settings.AXES_ENABLED = True
    c = APIClient()
    for _ in range(5):
        c.post("/api/v1/auth/login/", {"username": "process.editor", "password": "wrong"}, format="json")
    r = c.post("/api/v1/auth/login/", {"username": "process.editor", "password": PASSWORD}, format="json")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "locked_out"


@pytest.mark.django_db
def test_health_ignores_unknown_host(settings):
    settings.ALLOWED_HOSTS = ["xcore.example.com"]
    r = APIClient().get("/api/v1/health/", HTTP_HOST="10.0.0.12:10000")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_database_url_parsing():
    from config.settings.base import _database_from_url

    db = _database_from_url("postgresql://xcore:p%40ss@dpg-abc.frankfurt-postgres.render.com:5432/xcore?sslmode=require")
    assert db["USER"] == "xcore" and db["PASSWORD"] == "p@ss" and db["HOST"].startswith("dpg-")
    assert db["NAME"] == "xcore" and db["OPTIONS"]["sslmode"] == "require"


@pytest.mark.django_db
def test_ensure_admin(monkeypatch):
    from django.core.management import call_command

    from apps.accounts.models import User

    monkeypatch.setenv("XCORE_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("XCORE_ADMIN_PASSWORD", "Render-Admin-Passw0rd!")
    call_command("ensure_admin", verbosity=0)
    u = User.objects.get(username="admin")
    assert u.is_superuser and u.role == "admin" and u.check_password("Render-Admin-Passw0rd!")
