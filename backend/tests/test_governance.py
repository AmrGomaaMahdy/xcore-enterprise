import pytest

from apps.governance.models import ApprovalRequest
from apps.kpis.models import KpiTarget
from apps.processes.models import Activity, ProcessVersion


@pytest.mark.django_db
def test_approve_tobe_draft_retires_previous_and_syncs(approver):
    req = ApprovalRequest.objects.get(entity_type="process_version", status="pending")
    r = approver.post(f"/api/v1/governance/approvals/{req.pk}/approve/", {"comment": "ok"}, format="json")
    assert r.status_code == 200, r.content
    v31 = ProcessVersion.objects.get(process__code="15-030", kind="To-Be", version="3.1")
    v30 = ProcessVersion.objects.get(process__code="15-030", kind="To-Be", version="3.0")
    assert v31.status == "Approved" and v30.status == "Retired"
    assert Activity.objects.filter(process__code="15-030", in_current_model=True).exists()


@pytest.mark.django_db
def test_maker_cannot_check(editor, approver):
    from apps.accounts.models import User

    target = KpiTarget.objects.create(target_id="TGT-TEST-01", kpi_id=KpiTarget.objects.first().kpi_id, period="2027", green=90, amber=80)
    target.status = "Draft"
    target.save()
    User.objects.filter(username="process.editor").update(role="approver")
    assert editor.post(f"/api/v1/kpis/targets/{target.pk}/submit/", {}, format="json").status_code == 201
    req = ApprovalRequest.objects.get(entity_type="kpi_target", entity_pk=target.pk)
    assert editor.post(f"/api/v1/governance/approvals/{req.pk}/approve/", {}, format="json").status_code == 409


@pytest.mark.django_db
def test_reject_needs_reason_and_reverts(approver):
    req = ApprovalRequest.objects.filter(entity_type="kpi_target", status="pending").first()
    assert approver.post(f"/api/v1/governance/approvals/{req.pk}/reject/", {}, format="json").status_code == 409
    assert approver.post(f"/api/v1/governance/approvals/{req.pk}/reject/", {"comment": "too low"}, format="json").status_code == 200
    assert KpiTarget.objects.get(pk=req.entity_pk).status == "Draft"


@pytest.mark.django_db
def test_editor_cannot_approve(editor):
    req = ApprovalRequest.objects.filter(status="pending").first()
    assert editor.post(f"/api/v1/governance/approvals/{req.pk}/approve/", {}, format="json").status_code == 409


@pytest.mark.django_db
@pytest.mark.parametrize(
    "kind,ref",
    [("activity", "T-030-02"), ("process", "PRO"), ("kpi", "15-030-KPI-02"), ("sub_job_family", "PRC-OPS"), ("system", "Oracle")],
)
def test_impact_analysis(viewer, kind, ref):
    r = viewer.get("/api/v1/governance/impact/", {"type": kind, "ref": ref})
    assert r.status_code == 200, r.content
    assert r.json()["sections"]


@pytest.mark.django_db
def test_impact_kpi_reaches_objective(viewer):
    data = viewer.get("/api/v1/governance/impact/", {"type": "kpi", "ref": "15-030-KPI-02"}).json()
    objectives = next(s for s in data["sections"] if s["title"].startswith("Strategic"))
    assert {"code": "OBJ-01"} in objectives["items"]
