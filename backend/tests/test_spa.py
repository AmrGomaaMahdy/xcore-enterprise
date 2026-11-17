import pytest
from django.test import Client, override_settings
from django.urls import clear_url_caches


@pytest.fixture
def spa(tmp_path, settings):
    (tmp_path / "index.html").write_text("<!doctype html><title>X-Core</title><div id=root></div>")
    settings.SPA_DIR = str(tmp_path)
    import importlib

    import config.urls

    clear_url_caches()
    importlib.reload(config.urls)
    yield
    settings.SPA_DIR = ""
    clear_url_caches()
    importlib.reload(config.urls)


@pytest.mark.django_db
def test_spa_routes_return_index_with_csp(spa):
    with override_settings(ROOT_URLCONF="config.urls"):
        r = Client().get("/library/15-030")
    assert r.status_code == 200 and b"X-Core" in r.content
    assert "script-src 'self'" in r["Content-Security-Policy"]
    assert r["Cache-Control"] == "no-store"


@pytest.mark.django_db
def test_api_is_not_swallowed_by_spa(spa):
    assert Client().get("/api/v1/does-not-exist/").status_code == 404
