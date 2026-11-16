from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError

from apps.kpis import engine
from apps.kpis.models import Kpi
from apps.processes.models import ProcessNode


def test_score_directions():
    assert engine.score(90, 100, "higher") == 90
    assert engine.score(5, 4, "lower") == 80
    assert engine.score(120, 100, "higher") == 100  # capped


@pytest.mark.django_db
def test_naming_convention_enforced(demo):
    k = Kpi(kpi_id="PRO-KPI-1", node=ProcessNode.objects.get(code="PRO"), level=2, name="x", calc_type="Direct")
    with pytest.raises(ValidationError):
        k.clean()


@pytest.mark.django_db
def test_library_tiers(editor):
    data = editor.get("/api/v1/kpis/library/").json()
    tiers = {k["tier"] for k in data}
    assert {"Strategic KPI", "Functional KPI", "Sub-functional KPI", "Process KPI", "Operational indicator"} <= tiers
    pro = editor.get("/api/v1/kpis/library/PRO-KPI-01/").json()
    assert pro["calc_type"] == "Direct" and "15-028-KPI-02" in pro["explained_by"]


@pytest.mark.django_db
def test_alignment_contribution(editor):
    data = editor.get("/api/v1/kpis/alignment/").json()
    assert len(data["objectives"]) == 5
    row = next(r for r in data["rows"] if r["objective"] == "OBJ-01" and r["kpi_id"] == "15-030-KPI-02")
    assert row["contribution"] == 50.0  # CSP-KPI-01 50% × SCM-KPI-02 100% × PRO-KPI-02 100%


@pytest.mark.django_db
def test_cascade_excludes_outcome(editor):
    data = editor.get("/api/v1/kpis/cascade/").json()
    ids = {n["id"] for n in data["nodes"]}
    assert "ENT-KPI-01" not in ids and "CSP-KPI-01" in ids
    assert all("actual" not in n for n in data["nodes"])  # metadata only


@pytest.mark.django_db
def test_derived_weights_must_total_100(editor):
    r = editor.put("/api/v1/kpis/library/CSP-KPI-01/weights/", {"weights": {"SCM-KPI-02": 60, "SCM-KPI-06": 20}}, format="json")
    assert r.status_code == 409
    r = editor.put(
        "/api/v1/kpis/library/CSP-KPI-01/weights/", {"weights": {"SCM-KPI-02": 60, "SCM-KPI-06": 20, "SCM-KPI-04": 20}}, format="json"
    )
    assert r.status_code == 200
    assert {x["kpi_id"]: Decimal(str(x["weight"])) for x in r.json()["rolls_up"]}["SCM-KPI-02"] == Decimal("60")
