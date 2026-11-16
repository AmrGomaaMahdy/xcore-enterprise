export type Role = 'viewer' | 'editor' | 'approver' | 'admin';

export interface Me {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  job_title: string;
  business_unit: string;
  can_edit: boolean;
  can_approve: boolean;
}

export interface TreeNode {
  id: number;
  code: string;
  level: 0 | 1 | 2 | 3;
  parent: number | null;
  name: string;
  status: string;
  order: number;
  owner: string;
  child_count?: number;
  activity_count?: number;
}

export interface ProcessNode extends TreeNode {
  parent_code: string | null;
  path: { code: string; name: string; level: number }[];
  description: string;
  owner_job: string | null;
  process_type: string;
  business_units: string[];
  systems: string;
  criticality: string;
  job_family: string;
  sub_job_family: string;
  start_trigger: string;
  applicable_domains: string;
  modelling_standard: string;
  avg_cycle_tobe: string;
  residual_bottlenecks: string;
  annual_volume: string;
  review_months: number | null;
  counts: Record<string, number>;
  updated_at: string;
}

export type VersionStatus = 'Draft' | 'In review' | 'Approved' | 'Retired';

export interface ProcessVersion {
  id: number;
  process: number;
  process_code: string;
  kind: 'As-Is' | 'To-Be';
  version: string;
  status: VersionStatus;
  note: string;
  based_on: number | null;
  based_on_label: string | null;
  approved_by: string;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  bpmn_xml?: string;
}

export type Automation = 'Manual' | 'Workflow' | 'Assisted' | 'Automated';

export interface Activity {
  id: number;
  process: number;
  process_code: string;
  task_id: string;
  name: string;
  bpmn_type: string;
  lane: string;
  parent_task: string;
  parent_name: string;
  order: number;
  system: string;
  automation: Automation;
  automation_locked: boolean;
  traceable: boolean;
  steps: string;
  data_in: string;
  data_out: string;
  in_current_model: boolean;
}

export interface Lane {
  id: number;
  process: number;
  name: string;
  sub_job_family: string | null;
  sub_job_family_name: string | null;
  job_family: string | null;
  job_family_name: string | null;
  is_external: boolean;
  order: number;
  activity_count: number;
}

export interface Risk {
  id: number;
  process: number;
  risk_id: string;
  title: string;
  step: string;
  owner: string;
  likelihood: number;
  impact: number;
  rating: number;
  control: string;
  control_type: string;
  status: string;
}

export interface ProcessDocument {
  id: number;
  process: number;
  doc_id: string;
  title: string;
  doc_type: string;
  version: string;
  url: string;
  step: string;
  owner: string;
}

export interface QualityCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface RaciRow {
  task_id: string;
  name: string;
  responsible: string;
  responsible_sjf: string;
  accountable: string;
  accountable_job: string;
}

export interface SodRow {
  rule: string;
  why: string;
  a: { task_id: string; name: string; lane: string; sub_job_family: string | null };
  b: { task_id: string; name: string; lane: string; sub_job_family: string | null };
  conflict: boolean;
}

export interface HistoryRow {
  at: string;
  by: string;
  action: string;
  what: string;
}

export interface Objective {
  code: string;
  name: string;
  description: string;
  is_outcome: boolean;
  order: number;
}

export type CalcType = 'Measured' | 'Derived' | 'Gate' | 'Direct';

export interface Kpi {
  id: number;
  kpi_id: string;
  node: number;
  node_code: string;
  node_name: string;
  domain: string;
  level: number;
  tier: string;
  name: string;
  definition: string;
  unit: string;
  direction: 'higher' | 'lower';
  calc_type: CalcType;
  formula: string;
  source: string;
  owner: string;
  from_task: string;
  to_task: string;
  measure_process: string;
  objective: string | null;
  is_outcome: boolean;
  key: string;
  actual: string | null;
  baseline: string | null;
  actual_period: string;
  rolls_up: { kpi_id: string; weight: string }[];
  explained_by: string[];
  used_by: { kpi_id: string; relation: string }[];
  target: { target_id: string; period: string; green: string; amber: string } | null;
}

export interface KpiTarget {
  id: number;
  target_id: string;
  kpi: string;
  scope: string;
  period: string;
  green: string;
  amber: string;
  reason: string;
  status: 'Draft' | 'In review' | 'Active' | 'Expired';
  approved_by: string;
  approved_at: string | null;
}

export interface Alignment {
  objectives: (Objective & { kpis: string[]; score: number | null })[];
  rows: {
    objective: string;
    kpi_id: string;
    name: string;
    level: number;
    tier: string;
    node: string;
    contribution: number;
    driver: boolean;
  }[];
  chains: { objective: string; path: string[]; contribution: number; driver: boolean }[];
}

export interface CascadeNode {
  id: string;
  name: string;
  level: number;
  tier: string;
  node: string;
  domain: string;
  calc_type: CalcType;
  objective: string | null;
  unit: string;
  direction: string;
  rule: string;
}

export interface Cascade {
  nodes: CascadeNode[];
  edges: { source: string; target: string; relation: 'rolls_up' | 'explains'; weight: number | null }[];
  tiers: Record<string, string>;
}

export interface Service {
  id: number;
  service_id: string;
  process: number;
  process_code: string;
  process_name: string;
  name: string;
  category: string;
  description: string;
  requester: string;
  channel: string;
  trigger: string;
  inputs: string;
  output: string;
  sla: string;
  owner: string;
  status: VersionStatus;
  task_ids: string[];
  activities: { task_id: string; name: string }[];
  kpis: string[];
  source_version: string;
  generated: boolean;
  confidence: number | null;
  open_issues: string[];
  updated_at: string;
}

export interface Candidate {
  key: string;
  name: string;
  category: string;
  verdict: 'service' | 'activity' | 'enhance';
  confidence: number;
  description: string;
  reason: string;
  recipient: string;
  trigger: string;
  inputs: string;
  output: string;
  owner: string;
  sla: string | null;
  system: string;
  automation: string;
  source_activity: string;
  evidence: { task_id: string; name: string; lane: string; match: number }[];
  kpis: { label: string; kpi_id: string | null; key: boolean }[];
  existing_service: string | null;
  flags: string[];
  source_version: string;
}

export interface GeneratorMeta {
  rules: [string, string][];
  pipeline: { ic: string; t: string; d: string }[];
  catalog_types: [string, string, string, string][];
  processes: { code: string; name: string }[];
}

export interface ApprovalRequest {
  id: number;
  entity_type: 'process_version' | 'kpi_target' | 'service';
  entity_pk: number;
  entity_label: string;
  process_code: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  submitted_label: string;
  submitted_at: string;
  submit_comment: string;
  decided_label: string;
  decided_at: string | null;
  decision_comment: string;
  can_decide: boolean;
}

export interface ImpactResult {
  type: string;
  ref: string;
  label: string;
  total: number;
  sections: { title: string; count: number; severity: 'high' | 'medium' | 'info'; items: Record<string, unknown>[] }[];
}

export interface ImpactOptions {
  activity: { task_id: string; name: string; process__code: string }[];
  process: { code: string; name: string; level: number }[];
  kpi: { kpi_id: string; name: string }[];
  sub_job_family: { code: string; name: string }[];
  system: string[];
}

export interface AuditEntry {
  id: number;
  at: string;
  actor_label: string;
  action: string;
  entity_type: string;
  entity_id: string;
  process_code: string;
  summary: string;
}

export interface SubJobFamily {
  code: string;
  name: string;
  job_family: string;
  job_family_name: string;
  employee_count: number;
}

export interface Overview {
  processes: {
    code: string;
    name: string;
    parent: string | null;
    owner: string;
    criticality: string;
    activities: number;
    kpis: number;
    risks: number;
    tobe: string | null;
    quality: number;
  }[];
  domains: { code: string; name: string; functions: number; processes: number }[];
  nodes: Record<string, number>;
  versions: Record<string, number>;
  activities: { total: number; traceable: number; by_automation: Record<string, number> };
  kpis: { total: number; by_level: Record<string, number> };
  objectives: number;
  targets: Record<string, number>;
  services: Record<string, number>;
  approvals_pending: number;
  hcm: { sub_job_families: number; employees: number };
  recent: { at: string; actor_label: string; summary: string; process_code: string }[];
}

export interface HeatRow {
  process: string;
  name: string;
  Manual: number;
  Workflow: number;
  Assisted: number;
  Automated: number;
  traceable: number;
  total: number;
}

export interface DiffTask {
  task_id: string;
  name: string;
  bpmn_type: string;
  lane: string;
  parent_name: string;
}

export interface VersionDiff {
  base: { id: number; label: string; status: string; tasks: number; lanes: number };
  target: { id: number; label: string; status: string; tasks: number; lanes: number };
  added: DiffTask[];
  removed: DiffTask[];
  changed: {
    task_id: string;
    name: string;
    fields: string[];
    before: Record<string, string>;
    after: Record<string, string>;
  }[];
  unchanged: number;
  lanes_added: string[];
  lanes_removed: string[];
}

export interface ApprovalContext {
  entity_type: ApprovalRequest['entity_type'];
  steps: { label: string; state: 'done' | 'current' | 'todo' | 'failed'; by?: string; at?: string | null }[];
  version?: { id: number; label: string; status: string; note: string };
  live?: { id: number; label: string } | null;
  diff?: VersionDiff | null;
  quality?: QualityCheck[];
  target?: {
    kpi: string;
    kpi_name: string;
    unit: string;
    direction: string;
    period: string;
    green: string;
    amber: string;
    reason: string;
    actual: string | null;
    baseline: string | null;
  };
  live_target?: { period: string; green: string; amber: string } | null;
  service?: {
    service_id: string;
    name: string;
    owner: string;
    sla: string;
    description: string;
    task_ids: string[];
    kpis: string[];
    open_issues: string[];
  };
}

export interface ApprovalStats {
  by_status: Record<string, number>;
  pending_by_type: Record<string, number>;
  pending_by_process: Record<string, number>;
  oldest_pending_days: number;
  avg_pending_days: number;
  overdue: number;
}
