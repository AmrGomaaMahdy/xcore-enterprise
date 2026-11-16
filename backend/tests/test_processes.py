import pytest

from apps.processes import bpmn
from apps.processes.models import Activity

EVIL = """<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"><bpmn:process id="p"><bpmn:task id="t" name="&e;"/></bpmn:process></bpmn:definitions>"""


def test_bpmn_parser_blocks_xxe():
    with pytest.raises(bpmn.BpmnError):
        bpmn.parse(EVIL)


def test_bpmn_parser_requires_definitions():
    with pytest.raises(bpmn.BpmnError):
        bpmn.parse("<root/>")


@pytest.mark.django_db
def test_tree_and_detail(editor):
    tree = editor.get("/api/v1/processes/nodes/tree/").json()
    assert {n["code"] for n in tree} >= {"CON", "SCM", "PRO", "15-030", "15-028"}
    detail = editor.get("/api/v1/processes/nodes/15-030/").json()
    assert [p["code"] for p in detail["path"]] == ["CSP", "SCM", "PRO"]
    assert detail["counts"]["activities"] >= 18


@pytest.mark.django_db
def test_activities_follow_approved_tobe(editor):
    acts = editor.get("/api/v1/processes/activities/", {"process__code": "15-030"}).json()
    ids = {a["task_id"] for a in acts}
    assert "T-030-16" in ids and "A-030-01" not in ids  # To-Be, not As-Is


@pytest.mark.django_db
def test_service_task_automation_is_locked(editor):
    a = Activity.objects.get(task_id="T-030-02")
    assert a.bpmn_type == "serviceTask" and a.automation == "Automated"
    r = editor.patch(f"/api/v1/processes/activities/{a.pk}/", {"automation": "Manual"}, format="json")
    assert r.status_code == 400


@pytest.mark.django_db
def test_lanes_map_to_sub_job_families(editor):
    lanes = {lk["name"]: lk for lk in editor.get("/api/v1/processes/lanes/", {"process__code": "15-028"}).json()}
    assert lanes["Procurement Operations & Sourcing"]["sub_job_family"] == "PRC-SRC"
    assert lanes["Supplier"]["is_external"] is True


@pytest.mark.django_db
def test_quality_raci_sod(editor):
    q = editor.get("/api/v1/processes/nodes/15-030/quality/").json()
    assert {c["id"] for c in q} >= {"owner", "tobe", "sod"}
    raci = editor.get("/api/v1/processes/nodes/15-030/raci/").json()
    assert raci["rows"] and raci["owner"]
    sod = editor.get("/api/v1/processes/nodes/15-030/sod/").json()
    assert any(r["rule"].startswith("T-030-02") for r in sod)


@pytest.mark.django_db
def test_only_one_open_draft(editor):
    versions = editor.get("/api/v1/processes/versions/", {"process__code": "15-030", "kind": "To-Be", "status": "Approved"}).json()
    r = editor.post(f"/api/v1/processes/versions/{versions[0]['id']}/new-draft/", {}, format="json")
    assert r.status_code == 409  # 3.1 is already in review


@pytest.mark.django_db
def test_export_bpmn(editor):
    v = editor.get("/api/v1/processes/versions/", {"process__code": "15-028"}).json()[0]
    r = editor.get(f"/api/v1/processes/versions/{v['id']}/export/")
    assert r.status_code == 200 and b"bpmn:definitions" in r.content
