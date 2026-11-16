import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

PASSWORD = "Test-Passw0rd-123!"


@pytest.fixture
def demo(db, monkeypatch):
    monkeypatch.setenv("XCORE_DEMO_PASSWORD", PASSWORD)
    call_command("load_demo_data", verbosity=0)


def _client(username):
    from apps.accounts.models import User

    c = APIClient()
    c.force_authenticate(User.objects.get(username=username))
    return c


@pytest.fixture
def editor(demo):
    return _client("process.editor")


@pytest.fixture
def approver(demo):
    return _client("process.approver")


@pytest.fixture
def viewer(demo):
    return _client("xcore.viewer")
