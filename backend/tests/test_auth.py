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
