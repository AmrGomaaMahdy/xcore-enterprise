import pytest

from apps.catalog.generator import similarity


def test_similarity():
    assert similarity("Release PO at the agreed framework rate", "Release PO (framework / RFx)") > 0.45


@pytest.mark.django_db
def test_generator_flags_missing_commitments(editor):
    data = editor.get("/api/v1/catalog/generator/", {"process": "15-030"}).json()
    cands = data["candidates"]
    assert data["source_version"] == "To-Be v3.0"
    assert any(c["verdict"] == "activity" for c in cands)
    # SVC-PO-02 already exists in the catalog → reuse before creation
    issuance = next(c for c in cands if c["name"] == "Purchase Order Issuance")
    assert issuance["verdict"] == "enhance" and issuance["existing_service"] == "SVC-PO-02"
    assert all(c["sla"] is None and any("SLA" in f for f in c["flags"]) for c in cands if c["verdict"] == "service")


@pytest.mark.django_db
def test_adopt_candidate_creates_draft(editor):
    cands = editor.get("/api/v1/catalog/generator/", {"process": "15-030"}).json()["candidates"]
    cand = next(c for c in cands if c["verdict"] == "service" and c["evidence"])
    r = editor.post("/api/v1/catalog/generator/15-030/adopt/", {"key": cand["key"], "service_id": "SVC-PO-09"}, format="json")
    assert r.status_code == 201, r.content
    assert r.json()["status"] == "Draft" and r.json()["generated"] is True


@pytest.mark.django_db
def test_service_task_ids_validated(editor):
    svc = editor.get("/api/v1/catalog/services/").json()[0]
    r = editor.patch(f"/api/v1/catalog/services/{svc['id']}/", {"task_ids": ["T-999-99"]}, format="json")
    assert r.status_code == 400
