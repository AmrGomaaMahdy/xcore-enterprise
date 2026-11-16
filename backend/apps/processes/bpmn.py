"""
Safe BPMN 2.0 parsing. defusedxml blocks XXE, entity expansion and external DTDs —
never parse user-supplied XML with the standard library directly.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

BPMN_NS = "http://www.omg.org/spec/BPMN/20100524/MODEL"
MAX_BPMN_BYTES = 2 * 1024 * 1024
TASK_TYPES = {
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "scriptTask",
    "businessRuleTask",
    "sendTask",
    "receiveTask",
    "callActivity",
}


class BpmnError(ValueError):
    pass


@dataclass
class ParsedTask:
    task_id: str
    name: str
    bpmn_type: str
    lane: str = ""
    parent_task: str = ""
    parent_name: str = ""
    order: int = 0


@dataclass
class ParsedModel:
    process_name: str = ""
    lanes: list[str] = field(default_factory=list)
    tasks: list[ParsedTask] = field(default_factory=list)
    sub_processes: dict[str, str] = field(default_factory=dict)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse(xml: str) -> ParsedModel:
    if not xml or not xml.strip():
        raise BpmnError("The BPMN model is empty.")
    if len(xml.encode("utf-8")) > MAX_BPMN_BYTES:
        raise BpmnError("The BPMN model is larger than 2 MB.")
    try:
        root = SafeET.fromstring(xml.encode("utf-8"), forbid_dtd=True)
    except DefusedXmlException as exc:
        raise BpmnError("The BPMN file contains forbidden XML constructs.") from exc
    except SafeET.ParseError as exc:  # type: ignore[attr-defined]
        raise BpmnError(f"The BPMN file is not well-formed XML: {exc}") from exc
    if root.tag != f"{{{BPMN_NS}}}definitions":
        raise BpmnError("Root element must be bpmn:definitions (BPMN 2.0).")

    model = ParsedModel()
    lane_of: dict[str, str] = {}
    for lane in root.iter(f"{{{BPMN_NS}}}lane"):
        name = (lane.get("name") or lane.get("id") or "").strip()
        model.lanes.append(name)
        for ref in lane.findall(f"{{{BPMN_NS}}}flowNodeRef"):
            if ref.text:
                lane_of[ref.text.strip()] = name
    participant = root.find(f".//{{{BPMN_NS}}}participant")
    if participant is not None:
        model.process_name = participant.get("name", "")

    counter = 0

    def walk(element, parent_id: str = "", parent_name: str = "", parent_lane: str = ""):
        nonlocal counter
        for child in element:
            kind = _local(child.tag)
            cid = child.get("id", "")
            if kind == "subProcess":
                name = child.get("name", cid)
                model.sub_processes[cid] = name
                walk(child, cid, name, lane_of.get(cid, parent_lane))
            elif kind in TASK_TYPES and cid:
                counter += 1
                model.tasks.append(
                    ParsedTask(
                        task_id=cid,
                        name=(child.get("name") or cid).strip(),
                        bpmn_type=kind,
                        lane=lane_of.get(cid, parent_lane),
                        parent_task=parent_id,
                        parent_name=parent_name,
                        order=counter,
                    )
                )

    for process in root.findall(f"{{{BPMN_NS}}}process"):
        walk(process)
    if not model.tasks:
        raise BpmnError("The model has no activities (tasks).")
    ids = [t.task_id for t in model.tasks]
    if len(ids) != len(set(ids)):
        raise BpmnError("Activity ids must be unique inside a model.")
    return model
