import { useState } from 'react';
import { CheckCircle2, Download, FilePlus2, Pencil, Plus, Send, Trash2, XCircle } from 'lucide-react';

import { api, errorText } from '@/api/client';
import {
  useAction,
  useActivities,
  useDocuments,
  useKpis,
  useLanes,
  useNodeAction,
  useRisks,
  useSubJobFamilies,
  useTargets,
  useVersion,
  useVersions,
} from '@/api/hooks';
import type {
  Activity,
  Automation,
  HistoryRow,
  Lane,
  ProcessDocument,
  ProcessNode,
  ProcessVersion,
  QualityCheck,
  RaciRow,
  Risk,
  SodRow,
} from '@/api/types';
import { Badge, Empty, ErrorBox, fmtDate, fmtDateTime, KV, Modal, SearchBox, Select, Spinner } from '@/components/ui';

import { BpmnPanel } from './BpmnPanel';

const AUTOMATIONS: Automation[] = ['Manual', 'Workflow', 'Assisted', 'Automated'];

function Feedback({ error, ok }: { error?: unknown; ok?: string | null }) {
  return (
    <>
      {error ? <ErrorBox error={error} /> : null}
      {ok && <div className="alert alert--ok">{ok}</div>}
    </>
  );
}

// =============================================================== Main data
export function MainDataTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const isProcess = node.level === 3;
  return (
    <section className="card">
      <div className="card__head">
        <h3>Main data</h3>
        {canEdit && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>
      <p>{node.description || <span className="muted">No description.</span>}</p>
      <KV
        rows={[
          ['Code', <code key="c">{node.code}</code>],
          ['Level', `L${node.level}`],
          ['Status', <Badge key="s">{node.status}</Badge>],
          ['Accountable owner', node.owner],
          ['Owner job (HCM)', node.owner_job ?? ''],
          ...(isProcess
            ? ([
                ['Process type', node.process_type],
                ['Criticality', node.criticality],
                ['Start trigger', node.start_trigger],
                ['Systems', node.systems],
                ['Business units', node.business_units.join(' · ')],
                ['Job family', node.job_family],
                ['Sub job family', node.sub_job_family],
                ['Applicable domains', node.applicable_domains],
                ['Modelling standard', node.modelling_standard],
                ['Avg. cycle (To-Be)', node.avg_cycle_tobe],
                ['Residual bottlenecks', node.residual_bottlenecks],
                ['Annual volume', node.annual_volume],
                ['Review cycle', node.review_months ? `${node.review_months} months` : ''],
              ] as [string, string][])
            : []),
          ['Last updated', fmtDateTime(node.updated_at)],
        ]}
      />
      {editing && <NodeForm node={node} onClose={() => setEditing(false)} />}
    </section>
  );
}

function NodeForm({ node, onClose }: { node: ProcessNode; onClose: () => void }) {
  const [form, setForm] = useState({
    name: node.name,
    description: node.description,
    owner: node.owner,
    status: node.status,
    criticality: node.criticality,
    systems: node.systems,
    start_trigger: node.start_trigger,
    avg_cycle_tobe: node.avg_cycle_tobe,
    annual_volume: node.annual_volume,
  });
  const save = useAction(
    (body: typeof form) => api.patch(`/processes/nodes/${node.code}/`, body),
    [['node'], ['tree']],
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal
      title={`Edit ${node.code}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            Save
          </button>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input value={form.name} onChange={set('name')} maxLength={200} />
        </label>
        <label className="field">
          <span>Accountable owner</span>
          <input value={form.owner} onChange={set('owner')} maxLength={150} />
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status} onChange={set('status')}>
            {['Active', 'Draft', 'Retired'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {node.level === 3 && (
          <>
            <label className="field">
              <span>Criticality</span>
              <select value={form.criticality} onChange={set('criticality')}>
                {['', 'High', 'Medium', 'Low'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Systems</span>
              <input value={form.systems} onChange={set('systems')} />
            </label>
            <label className="field">
              <span>Start trigger</span>
              <input value={form.start_trigger} onChange={set('start_trigger')} />
            </label>
            <label className="field">
              <span>Avg. cycle (To-Be)</span>
              <input value={form.avg_cycle_tobe} onChange={set('avg_cycle_tobe')} />
            </label>
            <label className="field">
              <span>Annual volume</span>
              <input value={form.annual_volume} onChange={set('annual_volume')} />
            </label>
          </>
        )}
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Description</span>
        <textarea value={form.description} onChange={set('description')} />
      </label>
    </Modal>
  );
}

// =============================================================== Model
export function ModelTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const versions = useVersions(node.code);
  const list = versions.data ?? [];
  const pick = list.find((v) => v.kind === 'To-Be' && v.status === 'Approved') ?? list[0];
  const [chosen, setChosen] = useState<number | null>(null);
  const id = chosen ?? pick?.id ?? null;
  const version = useVersion(id);
  const save = useAction(
    (xml: string) => api.put(`/processes/versions/${id}/model/`, { bpmn_xml: xml }),
    [['version'], ['versions']],
  );
  const [ok, setOk] = useState<string | null>(null);

  if (versions.isLoading) return <Spinner />;
  if (!list.length) return <Empty>No BPMN model yet.</Empty>;
  const v = version.data;
  return (
    <section className="card">
      <div className="card__head">
        <h3>BPMN 2.0 model</h3>
        <div className="toolbar" style={{ margin: 0 }}>
          <Select
            label="Version"
            allLabel={null}
            value={String(id ?? '')}
            onChange={(x) => setChosen(Number(x))}
            options={list.map((x) => ({ value: String(x.id), label: `${x.kind} v${x.version} · ${x.status}` }))}
          />
          {v && (
            <a className="btn btn--ghost btn--sm" href={api.url(`/processes/versions/${v.id}/export/`)}>
              <Download size={14} /> Export .bpmn
            </a>
          )}
        </div>
      </div>
      <Feedback error={save.error} ok={ok} />
      {v?.bpmn_xml ? (
        <BpmnPanel
          xml={v.bpmn_xml}
          editable={canEdit && v.status === 'Draft'}
          saving={save.isPending}
          onSave={(xml) => save.mutate(xml, { onSuccess: () => setOk('Model saved to the draft.') })}
        />
      ) : (
        <Spinner />
      )}
      {v?.note && <p className="muted small">{v.note}</p>}
    </section>
  );
}

// =============================================================== Activities (L4)
export function ActivitiesTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const { data, isLoading } = useActivities({ process__code: node.code, in_current_model: true });
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState('');
  const [edit, setEdit] = useState<Activity | null>(null);
  if (isLoading) return <Spinner />;
  const rows = (data ?? []).filter(
    (a) =>
      (!auto || a.automation === auto) &&
      (!q || `${a.task_id} ${a.name} ${a.lane} ${a.system}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <section>
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search activities" />
        <Select
          label="Automation"
          value={auto}
          onChange={setAuto}
          options={AUTOMATIONS.map((a) => ({ value: a, label: a }))}
        />
        <span className="muted small">
          Activities come from the approved To-Be model; system, automation and steps are maintained here.
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Activity</th>
              <th>Sub-process</th>
              <th>Lane</th>
              <th>BPMN type</th>
              <th>System</th>
              <th>Automation</th>
              <th>Traceable</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>
                  <code>{a.task_id}</code>
                </td>
                <td>
                  {a.name}
                  {a.steps && <div className="small muted">{a.steps}</div>}
                </td>
                <td className="small">{a.parent_name}</td>
                <td>{a.lane}</td>
                <td className="small mono">{a.bpmn_type}</td>
                <td>{a.system}</td>
                <td>
                  <Badge tone={a.automation === 'Automated' ? 'ok' : a.automation === 'Manual' ? 'warn' : 'info'}>
                    {a.automation}
                  </Badge>
                </td>
                <td>
                  {a.traceable ? (
                    <CheckCircle2 size={16} className="check__icon--ok" />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                {canEdit && (
                  <td>
                    <button className="icon-btn" onClick={() => setEdit(a)} aria-label={`Edit ${a.task_id}`}>
                      <Pencil size={14} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <ActivityForm activity={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function ActivityForm({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const [form, setForm] = useState({
    system: activity.system,
    automation: activity.automation,
    traceable: activity.traceable,
    steps: activity.steps,
    data_in: activity.data_in,
    data_out: activity.data_out,
  });
  const save = useAction(
    (body: typeof form) => api.patch(`/processes/activities/${activity.id}/`, body),
    [['activities']],
  );
  return (
    <Modal
      title={`${activity.task_id} · ${activity.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
            Save
          </button>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <div className="form-grid">
        <label className="field">
          <span>System</span>
          <input value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} maxLength={120} />
        </label>
        <label className="field">
          <span>Automation</span>
          <select
            value={form.automation}
            disabled={activity.automation_locked}
            onChange={(e) => setForm({ ...form, automation: e.target.value as Automation })}
          >
            {AUTOMATIONS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="field field--inline" style={{ marginTop: 22 }}>
          <input
            type="checkbox"
            checked={form.traceable}
            onChange={(e) => setForm({ ...form, traceable: e.target.checked })}
          />
          <span>Leaves a timestamp in a system (traceable)</span>
        </label>
      </div>
      {activity.automation_locked && (
        <div className="alert alert--info small">
          A BPMN {activity.bpmn_type} fixes the automation level. Change the task type in the model to change it.
        </div>
      )}
      <label className="field" style={{ marginTop: 12 }}>
        <span>Steps</span>
        <textarea value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
      </label>
      <div className="form-grid" style={{ marginTop: 12 }}>
        <label className="field">
          <span>Data in</span>
          <input value={form.data_in} onChange={(e) => setForm({ ...form, data_in: e.target.value })} />
        </label>
        <label className="field">
          <span>Data out</span>
          <input value={form.data_out} onChange={(e) => setForm({ ...form, data_out: e.target.value })} />
        </label>
      </div>
    </Modal>
  );
}

// =============================================================== Lanes
export function LanesTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const { data, isLoading } = useLanes(node.code);
  const sjf = useSubJobFamilies();
  const save = useAction(
    ({ lane, value }: { lane: Lane; value: string }) =>
      api.patch(
        `/processes/lanes/${lane.id}/`,
        value === '__external'
          ? { is_external: true, sub_job_family: null }
          : { is_external: false, sub_job_family: value || null },
      ),
    [['lanes']],
  );
  if (isLoading) return <Spinner />;
  return (
    <section>
      <p className="muted">
        Every BPMN lane is a <strong>sub job family</strong> from Oracle Fusion HCM (or an external party). Every
        employee carries a mandatory sub job family, which belongs by default to its job family — so activities and KPIs
        cascade to people without needing jobs or positions.
      </p>
      <Feedback error={save.error} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lane</th>
              <th>Sub job family</th>
              <th>Job family</th>
              <th className="num">Activities</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((l) => (
              <tr key={l.id}>
                <td>
                  <strong>{l.name}</strong>
                </td>
                <td>
                  {canEdit ? (
                    <select
                      value={l.is_external ? '__external' : (l.sub_job_family ?? '')}
                      onChange={(e) => save.mutate({ lane: l, value: e.target.value })}
                      aria-label={`Sub job family for ${l.name}`}
                    >
                      <option value="">— not mapped —</option>
                      <option value="__external">External party</option>
                      {(sjf.data ?? []).map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.code} · {s.name}
                        </option>
                      ))}
                    </select>
                  ) : l.is_external ? (
                    <Badge tone="muted">External</Badge>
                  ) : l.sub_job_family ? (
                    `${l.sub_job_family} · ${l.sub_job_family_name}`
                  ) : (
                    <Badge tone="bad">Not mapped</Badge>
                  )}
                </td>
                <td>{l.job_family ? `${l.job_family} · ${l.job_family_name}` : <span className="muted">—</span>}</td>
                <td className="num">{l.activity_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// =============================================================== KPIs & targets
export function KpisTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const kpis = useKpis({ node__code: node.code });
  const targets = useTargets();
  const [propose, setPropose] = useState<string | null>(null);
  if (kpis.isLoading) return <Spinner />;
  const list = kpis.data ?? [];
  if (!list.length) return <Empty>No KPIs are defined at this node.</Empty>;
  return (
    <section>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>KPI</th>
              <th>Tier</th>
              <th>Calculation</th>
              <th>Measured on</th>
              <th>Targets (Company)</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {list.map((k) => {
              const ts = (targets.data ?? []).filter((t) => t.kpi === k.kpi_id);
              return (
                <tr key={k.id}>
                  <td>
                    <code>{k.kpi_id}</code>
                    <div>
                      <strong>{k.name}</strong>
                    </div>
                    <div className="small muted">{k.definition}</div>
                  </td>
                  <td>
                    <Badge tone={`l${Math.min(k.level, 4)}`}>{k.tier}</Badge>
                  </td>
                  <td className="small">
                    {k.calc_type}
                    <div className="muted">{k.formula}</div>
                  </td>
                  <td className="small mono">
                    {k.from_task ? `${k.from_task}${k.to_task ? ` → ${k.to_task}` : ''}` : '—'}
                  </td>
                  <td className="small">
                    {ts.map((t) => (
                      <div key={t.id}>
                        {t.period}: green {t.green} / amber {t.amber} {k.unit} <Badge>{t.status}</Badge>
                      </div>
                    ))}
                  </td>
                  {canEdit && (
                    <td>
                      <button className="btn btn--ghost btn--sm" onClick={() => setPropose(k.kpi_id)}>
                        <Plus size={13} /> Target
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {propose && <TargetForm kpiId={propose} onClose={() => setPropose(null)} />}
    </section>
  );
}

function TargetForm({ kpiId, onClose }: { kpiId: string; onClose: () => void }) {
  const year = new Date().getFullYear() + 1;
  const [form, setForm] = useState({
    target_id: `TGT-${kpiId}-${year}`,
    kpi: kpiId,
    scope: 'Company',
    period: String(year),
    green: '',
    amber: '',
    reason: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const create = useAction(
    async (body: typeof form) => {
      const t = await api.post<{ id: number }>('/kpis/targets/', body);
      await api.post(`/kpis/targets/${t.id}/submit/`, { comment: body.reason });
    },
    [['targets'], ['approvals']],
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal
      title={`Propose a target for ${kpiId}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            disabled={create.isPending || !form.green || !form.amber}
            onClick={() => create.mutate(form, { onSuccess: onClose, onError: (e) => setErr(errorText(e)) })}
          >
            <Send size={14} /> Submit for approval
          </button>
        </>
      }
    >
      {err && <div className="alert alert--error">{err}</div>}
      <div className="form-grid">
        <label className="field">
          <span>Target id</span>
          <input value={form.target_id} onChange={set('target_id')} />
        </label>
        <label className="field">
          <span>Period</span>
          <input value={form.period} onChange={set('period')} />
        </label>
        <label className="field">
          <span>Green threshold</span>
          <input inputMode="decimal" value={form.green} onChange={set('green')} />
        </label>
        <label className="field">
          <span>Amber threshold</span>
          <input inputMode="decimal" value={form.amber} onChange={set('amber')} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Reason / benchmark</span>
        <input value={form.reason} onChange={set('reason')} />
      </label>
      <p className="small muted">
        Targets become active only after an approver (not you) accepts them — maker-checker.
      </p>
    </Modal>
  );
}

// =============================================================== RACI
export function RaciTab({ node }: { node: ProcessNode }) {
  const raci = useNodeAction<{ owner: string; owner_job: string | null; rows: RaciRow[] }>(node.code, 'raci');
  const sod = useNodeAction<SodRow[]>(node.code, 'sod');
  if (raci.isLoading) return <Spinner />;
  return (
    <section className="grid">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Activity</th>
              <th>R · Responsible (lane)</th>
              <th>Sub job family</th>
              <th>A · Accountable</th>
            </tr>
          </thead>
          <tbody>
            {(raci.data?.rows ?? []).map((r) => (
              <tr key={r.task_id}>
                <td>
                  <code>{r.task_id}</code>
                </td>
                <td>{r.name}</td>
                <td>{r.responsible}</td>
                <td className="mono small">{r.responsible_sjf || <Badge tone="bad">unmapped</Badge>}</td>
                <td className="small">
                  {r.accountable} <span className="muted mono">{r.accountable_job}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3>Segregation of duties</h3>
        {(sod.data ?? []).length === 0 && <p className="muted">No SoD rules apply to this process.</p>}
        {(sod.data ?? []).map((s) => (
          <div key={s.rule} className="check">
            {s.conflict ? (
              <XCircle className="check__icon--bad" size={18} />
            ) : (
              <CheckCircle2 className="check__icon--ok" size={18} />
            )}
            <div>
              <strong>{s.rule}</strong> — {s.why}
              <div className="small muted">
                {s.a.task_id} in {s.a.lane} ({s.a.sub_job_family ?? 'unmapped'}) · {s.b.task_id} in {s.b.lane} (
                {s.b.sub_job_family ?? 'unmapped'})
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// =============================================================== Risks & controls
export function RisksTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const { data, isLoading } = useRisks(node.code);
  const [edit, setEdit] = useState<Partial<Risk> | null>(null);
  if (isLoading) return <Spinner />;
  return (
    <section>
      {canEdit && (
        <div className="toolbar">
          <button
            className="btn btn--sm"
            onClick={() =>
              setEdit({ process: node.id, likelihood: 3, impact: 3, status: 'Open', control_type: 'Preventive' })
            }
          >
            <Plus size={14} /> Add risk
          </button>
        </div>
      )}
      {!data?.length ? (
        <Empty>No risks recorded.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Risk</th>
                <th>Step</th>
                <th className="num">L × I</th>
                <th>Control</th>
                <th>Type</th>
                <th>Status</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>
                    <code>{r.risk_id}</code>
                    <div>{r.title}</div>
                    <div className="small muted">{r.owner}</div>
                  </td>
                  <td className="mono small">{r.step}</td>
                  <td className="num">
                    <Badge tone={r.rating >= 15 ? 'bad' : r.rating >= 8 ? 'warn' : 'ok'}>
                      {r.likelihood}×{r.impact} = {r.rating}
                    </Badge>
                  </td>
                  <td>{r.control}</td>
                  <td>{r.control_type}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                  </td>
                  {canEdit && (
                    <td>
                      <button className="icon-btn" onClick={() => setEdit(r)} aria-label="Edit risk">
                        <Pencil size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edit && <RiskForm risk={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function RiskForm({ risk, onClose }: { risk: Partial<Risk>; onClose: () => void }) {
  const [form, setForm] = useState(risk);
  const save = useAction(
    (body: Partial<Risk>) =>
      body.id ? api.patch(`/processes/risks/${body.id}/`, body) : api.post('/processes/risks/', body),
    [['risks']],
  );
  const set =
    (k: keyof Risk, num = false) =>
    (e: { target: { value: string } }) =>
      setForm({ ...form, [k]: num ? Number(e.target.value) : e.target.value });
  return (
    <Modal
      title={risk.id ? `Edit ${risk.risk_id}` : 'New risk'}
      onClose={onClose}
      footer={
        <button className="btn" disabled={save.isPending} onClick={() => save.mutate(form, { onSuccess: onClose })}>
          Save
        </button>
      }
    >
      <ErrorBox error={save.error} />
      <div className="form-grid">
        <label className="field">
          <span>Risk id</span>
          <input value={form.risk_id ?? ''} onChange={set('risk_id')} placeholder="R-030-02" />
        </label>
        <label className="field">
          <span>Step (task id)</span>
          <input value={form.step ?? ''} onChange={set('step')} />
        </label>
        <label className="field">
          <span>Likelihood (1–5)</span>
          <input type="number" min={1} max={5} value={form.likelihood ?? 3} onChange={set('likelihood', true)} />
        </label>
        <label className="field">
          <span>Impact (1–5)</span>
          <input type="number" min={1} max={5} value={form.impact ?? 3} onChange={set('impact', true)} />
        </label>
        <label className="field">
          <span>Control type</span>
          <select value={form.control_type ?? ''} onChange={set('control_type')}>
            {['Preventive', 'Detective', 'Corrective'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={form.status ?? 'Open'} onChange={set('status')}>
            {['Open', 'Mitigated', 'Accepted'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Title</span>
        <input value={form.title ?? ''} onChange={set('title')} />
      </label>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Control</span>
        <input value={form.control ?? ''} onChange={set('control')} />
      </label>
      <label className="field" style={{ marginTop: 12 }}>
        <span>Owner</span>
        <input value={form.owner ?? ''} onChange={set('owner')} />
      </label>
    </Modal>
  );
}

// =============================================================== Documents
export function DocumentsTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const { data, isLoading } = useDocuments(node.code);
  const [form, setForm] = useState<Partial<ProcessDocument> | null>(null);
  const save = useAction((body: Partial<ProcessDocument>) => api.post('/processes/documents/', body), [['documents']]);
  const remove = useAction((id: number) => api.del(`/processes/documents/${id}/`), [['documents']]);
  if (isLoading) return <Spinner />;
  return (
    <section>
      {canEdit && (
        <div className="toolbar">
          <button
            className="btn btn--sm"
            onClick={() => setForm({ process: node.id, doc_type: 'Policy', version: '1.0' })}
          >
            <FilePlus2 size={14} /> Add document link
          </button>
        </div>
      )}
      <Feedback error={remove.error} />
      {!data?.length ? (
        <Empty>
          No documents linked. Policies, SOPs, forms and work instructions can be linked here (https links only).
        </Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Id</th>
                <th>Title</th>
                <th>Type</th>
                <th>Version</th>
                <th>Step</th>
                <th>Owner</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.doc_id}</td>
                  <td>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        {d.title}
                      </a>
                    ) : (
                      d.title
                    )}
                  </td>
                  <td>{d.doc_type}</td>
                  <td>{d.version}</td>
                  <td className="mono small">{d.step}</td>
                  <td>{d.owner}</td>
                  {canEdit && (
                    <td>
                      <button className="icon-btn" onClick={() => remove.mutate(d.id)} aria-label="Remove document">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && (
        <Modal
          title="Link a document"
          onClose={() => setForm(null)}
          footer={
            <button
              className="btn"
              disabled={save.isPending}
              onClick={() => save.mutate(form, { onSuccess: () => setForm(null) })}
            >
              Save
            </button>
          }
        >
          <ErrorBox error={save.error} />
          <div className="form-grid">
            {(['doc_id', 'title', 'doc_type', 'version', 'url', 'step', 'owner'] as const).map((k) => (
              <label key={k} className="field">
                <span>{k.replace('_', ' ')}</span>
                <input value={(form[k] as string) ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

// =============================================================== Quality
export function QualityTab({ node }: { node: ProcessNode }) {
  const { data, isLoading } = useNodeAction<QualityCheck[]>(node.code, 'quality');
  if (isLoading) return <Spinner />;
  const passed = (data ?? []).filter((c) => c.ok).length;
  return (
    <section className="card">
      <div className="card__head">
        <h3>Release-readiness checklist</h3>
        <Badge tone={passed === data?.length ? 'ok' : 'warn'}>
          {passed} / {data?.length} passed
        </Badge>
      </div>
      {(data ?? []).map((c) => (
        <div className="check" key={c.id}>
          {c.ok ? (
            <CheckCircle2 className="check__icon--ok" size={18} />
          ) : (
            <XCircle className="check__icon--bad" size={18} />
          )}
          <div>
            <div>{c.label}</div>
            {c.detail && <div className="small muted">{c.detail}</div>}
          </div>
        </div>
      ))}
    </section>
  );
}

// =============================================================== Versions
export function VersionsTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const { data, isLoading } = useVersions(node.code);
  const [ok, setOk] = useState<string | null>(null);
  const inv = [['versions'], ['version'], ['approvals'], ['node']];
  const draft = useAction((v: ProcessVersion) => api.post(`/processes/versions/${v.id}/new-draft/`, {}), inv);
  const submit = useAction((v: ProcessVersion) => api.post(`/processes/versions/${v.id}/submit/`, {}), inv);
  const discard = useAction((v: ProcessVersion) => api.del(`/processes/versions/${v.id}/`), inv);
  if (isLoading) return <Spinner />;
  const err = draft.error ?? submit.error ?? discard.error;
  return (
    <section>
      <Feedback error={err} ok={ok} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Status</th>
              <th>Based on</th>
              <th>Note</th>
              <th>Approved</th>
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>
                    {v.kind} v{v.version}
                  </strong>
                  <div className="small muted">created {fmtDate(v.created_at)}</div>
                </td>
                <td>
                  <Badge>{v.status}</Badge>
                </td>
                <td className="small">{v.based_on_label ?? '—'}</td>
                <td className="small">{v.note}</td>
                <td className="small">{v.approved_at ? `${fmtDate(v.approved_at)} · ${v.approved_by}` : '—'}</td>
                {canEdit && (
                  <td>
                    <div className="toolbar" style={{ margin: 0 }}>
                      {v.status === 'Approved' && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            draft.mutate(v, {
                              onSuccess: () => setOk('Draft created — open it on the Model tab to edit.'),
                            })
                          }
                        >
                          New draft
                        </button>
                      )}
                      {v.status === 'Draft' && (
                        <>
                          <button
                            className="btn btn--sm"
                            onClick={() => submit.mutate(v, { onSuccess: () => setOk('Sent to the approval queue.') })}
                          >
                            <Send size={13} /> Submit
                          </button>
                          <button className="btn btn--ghost btn--sm" onClick={() => discard.mutate(v)}>
                            Discard
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">
        Lifecycle: Draft → In review → Approved → Retired. Approving a To-Be retires the previous approved To-Be and
        re-syncs the L4 activities; As-Is stays as the baseline.
      </p>
    </section>
  );
}

// =============================================================== History
export function HistoryTab({ node }: { node: ProcessNode }) {
  const { data, isLoading } = useNodeAction<HistoryRow[]>(node.code, 'history');
  if (isLoading) return <Spinner />;
  if (!data?.length) return <Empty>No changes recorded yet.</Empty>;
  return (
    <section className="card">
      <ul className="timeline">
        {data.map((h, i) => (
          <li key={i}>
            <div>{h.what}</div>
            <div className="small muted">
              {fmtDateTime(h.at)} · {h.by} · {h.action}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
