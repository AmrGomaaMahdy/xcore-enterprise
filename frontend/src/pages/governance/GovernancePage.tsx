import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gavel,
  Inbox,
  Minus,
  Plus,
  ShieldCheck,
  Target,
  Undo2,
  Workflow,
  X,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { api } from '@/api/client';
import { useAction, useApi, useApprovals } from '@/api/hooks';
import type { ApprovalContext, ApprovalRequest, ApprovalStats } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Ring } from '@/components/charts';
import { Badge, Empty, ErrorBox, fmtDateTime, PageHeader, Select, Spinner, Stat, Tabs } from '@/components/ui';

const TYPE_META: Record<ApprovalRequest['entity_type'], { label: string; icon: typeof Workflow; tone: string }> = {
  process_version: { label: 'Process model', icon: Workflow, tone: 'l0' },
  kpi_target: { label: 'KPI target', icon: Target, tone: 'l2' },
  service: { label: 'Catalog service', icon: Boxes, tone: 'l1' },
};
const LIFECYCLE = [
  { t: 'Draft', d: 'Editor models or proposes the change' },
  { t: 'Submitted', d: 'Maker sends it for review' },
  { t: 'Under review', d: 'Approver checks diff, quality and impact' },
  { t: 'Approved', d: 'Becomes live; previous version retired' },
];
type TabId = 'queue' | 'mine' | 'decided' | 'policy';

const ageDays = (at: string) => (Date.now() - new Date(at).getTime()) / 86_400_000;
function ageLabel(at: string) {
  const d = ageDays(at);
  return d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : `${Math.round(d)} d`;
}

export default function GovernancePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('queue');
  const [type, setType] = useState('');
  const [process, setProcess] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const all = useApprovals();
  const stats = useApi<ApprovalStats>(['approvals', 'stats'], '/governance/approvals/stats/');
  const me = user?.display_name || user?.username;

  const rows = useMemo(() => {
    const list = all.data ?? [];
    return list
      .filter((r) =>
        tab === 'queue' ? r.status === 'pending' : tab === 'mine' ? r.submitted_label === me : r.status !== 'pending',
      )
      .filter((r) => (!type || r.entity_type === type) && (!process || r.process_code === process));
  }, [all.data, tab, type, process, me]);
  const processes = [...new Set((all.data ?? []).map((r) => r.process_code).filter(Boolean))].sort();
  const current = rows.find((r) => r.id === selected) ?? rows[0];
  const s = stats.data;

  return (
    <>
      <PageHeader
        eyebrow="Process governance"
        title="Governance & approvals"
        subtitle="Every change to a process model, KPI target or catalog service goes through maker-checker review before it becomes live. The person who submits can never approve the same request."
      />

      <div className="gov-stats">
        <Stat
          label="Waiting for decision"
          value={s?.by_status.pending ?? 0}
          tone={s?.by_status.pending ? 'warn' : undefined}
        />
        <Stat label="Overdue (> 5 days)" value={s?.overdue ?? 0} tone={s?.overdue ? 'warn' : undefined} />
        <Stat
          label="Average wait"
          value={`${s?.avg_pending_days ?? 0} d`}
          hint={`oldest ${s?.oldest_pending_days ?? 0} d`}
        />
        <Stat label="Approved" value={s?.by_status.approved ?? 0} tone="gold" />
        <Stat label="Rejected" value={s?.by_status.rejected ?? 0} />
      </div>

      <section className="lifecycle card">
        {LIFECYCLE.map((step, i) => (
          <div key={step.t} className="lifecycle__step">
            <span className="lifecycle__dot">{i + 1}</span>
            <div>
              <strong>{step.t}</strong>
              <div className="small muted">{step.d}</div>
            </div>
            {i < LIFECYCLE.length - 1 && <ArrowRight size={16} className="lifecycle__arrow" />}
          </div>
        ))}
      </section>

      <Tabs
        tabs={[
          { id: 'queue', label: 'Decision queue', count: s?.by_status.pending ?? 0, icon: <Inbox size={15} /> },
          { id: 'mine', label: 'My submissions', icon: <Clock size={15} /> },
          { id: 'decided', label: 'Decided', icon: <Gavel size={15} /> },
          { id: 'policy', label: 'Governance policy', icon: <ShieldCheck size={15} /> },
        ]}
        value={tab}
        onChange={(t) => {
          setTab(t);
          setSelected(null);
        }}
      />

      {tab === 'policy' ? (
        <Policy />
      ) : (
        <>
          <div className="toolbar">
            <div className="chip-group" role="group" aria-label="Type">
              <button className={`chip ${type === '' ? 'is-on' : ''}`} onClick={() => setType('')}>
                All
              </button>
              {(Object.keys(TYPE_META) as ApprovalRequest['entity_type'][]).map((k) => {
                const M = TYPE_META[k];
                return (
                  <button key={k} className={`chip ${type === k ? 'is-on' : ''}`} onClick={() => setType(k)}>
                    <M.icon size={13} /> {M.label}
                    {tab === 'queue' && s?.pending_by_type[k] ? (
                      <span className="chip__n">{s.pending_by_type[k]}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <Select
              label="Process"
              value={process}
              onChange={setProcess}
              options={processes.map((p) => ({ value: p, label: p }))}
            />
          </div>
          {!user?.can_approve && tab === 'queue' && (
            <div className="alert alert--info small">
              Your role can follow requests; deciding requires the Approver role.
            </div>
          )}
          <ErrorBox error={all.error} />
          {all.isLoading ? (
            <Spinner />
          ) : !rows.length ? (
            <Empty>{tab === 'queue' ? 'Nothing is waiting for a decision. 🎉' : 'Nothing here.'}</Empty>
          ) : (
            <div className="gov-layout">
              <ul className="req-list">
                {rows.map((r) => {
                  const M = TYPE_META[r.entity_type];
                  const overdue = r.status === 'pending' && ageDays(r.submitted_at) > 5;
                  return (
                    <li key={r.id}>
                      <button
                        className={`req-card ${current?.id === r.id ? 'is-active' : ''}`}
                        onClick={() => setSelected(r.id)}
                      >
                        <span className={`req-card__icon req-card__icon--${M.tone}`}>
                          <M.icon size={16} />
                        </span>
                        <span className="req-card__body">
                          <span className="req-card__title">{r.title}</span>
                          <span className="req-card__meta">
                            <code>{r.process_code}</code> · {M.label} · {r.submitted_label}
                          </span>
                        </span>
                        {r.status === 'pending' ? (
                          <span className={`age ${overdue ? 'age--late' : ''}`}>
                            <Clock size={11} /> {ageLabel(r.submitted_at)}
                          </span>
                        ) : (
                          <Badge>{r.status}</Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {current && <RequestDetail key={current.id} req={current} me={me} />}
            </div>
          )}
        </>
      )}
    </>
  );
}

function RequestDetail({ req, me }: { req: ApprovalRequest; me?: string }) {
  const ctx = useApi<ApprovalContext>(['approvals', 'context', req.id], `/governance/approvals/${req.id}/context/`);
  const [comment, setComment] = useState('');
  const inv = [
    ['approvals'],
    ['versions'],
    ['version'],
    ['targets'],
    ['services'],
    ['activities'],
    ['node'],
    ['overview'],
    ['tree'],
  ];
  const decide = useAction(
    (approve: boolean) => api.post(`/governance/approvals/${req.id}/${approve ? 'approve' : 'reject'}/`, { comment }),
    inv,
  );
  const withdraw = useAction(() => api.post(`/governance/approvals/${req.id}/withdraw/`, {}), inv);
  const M = TYPE_META[req.entity_type];
  const c = ctx.data;

  return (
    <article className="req-detail card">
      <div className="req-detail__head">
        <span className={`req-card__icon req-card__icon--${M.tone}`}>
          <M.icon size={18} />
        </span>
        <div>
          <div className="small muted">
            {M.label} · <code>{req.entity_label}</code>
          </div>
          <h2>{req.title}</h2>
        </div>
        <Badge>{req.status}</Badge>
      </div>

      {c && (
        <ol className="stepper">
          {c.steps.map((st) => (
            <li key={st.label} className={`stepper__step is-${st.state}`}>
              <span className="stepper__dot">
                {st.state === 'done' ? <Check size={12} /> : st.state === 'failed' ? <X size={12} /> : null}
              </span>
              <span className="stepper__label">{st.label}</span>
              {st.by && <span className="stepper__by">{st.by}</span>}
              {st.at && <span className="stepper__by">{fmtDateTime(st.at)}</span>}
            </li>
          ))}
        </ol>
      )}

      {req.summary && <p>{req.summary}</p>}
      {req.submit_comment && (
        <blockquote className="quote">
          “{req.submit_comment}” — {req.submitted_label}
        </blockquote>
      )}
      {ctx.isLoading && <Spinner label="Loading decision context…" />}
      <ErrorBox error={ctx.error} />

      {c?.entity_type === 'process_version' && (
        <div className="ctx">
          <div className="ctx__row">
            <div>
              <h4>Change against the live model</h4>
              <div className="small muted">
                {c.diff ? `${c.diff.base.label} → ${c.diff.target.label}` : 'First version — nothing to compare yet'}
                {c.live && ` · live today: ${c.live.label}`}
              </div>
            </div>
            <Link className="btn btn--ghost btn--sm" to={`/library/${req.process_code}`}>
              <ExternalLink size={13} /> Open model
            </Link>
          </div>
          {c.diff && (
            <>
              <div className="diff-chips">
                <span className="diff-chip diff-chip--added">
                  <Plus size={12} /> {c.diff.added.length} added
                </span>
                <span className="diff-chip diff-chip--changed">~ {c.diff.changed.length} changed</span>
                <span className="diff-chip diff-chip--removed">
                  <Minus size={12} /> {c.diff.removed.length} removed
                </span>
                <span className="diff-chip">{c.diff.unchanged} unchanged</span>
              </div>
              <div className="ctx__changes">
                {c.diff.added.map((t) => (
                  <div key={t.task_id} className="ctx__change ctx__change--added">
                    <Plus size={12} /> <code>{t.task_id}</code> {t.name} <span className="muted">· {t.lane}</span>
                  </div>
                ))}
                {c.diff.changed.map((t) => (
                  <div key={t.task_id} className="ctx__change ctx__change--changed">
                    ~ <code>{t.task_id}</code> {t.name}{' '}
                    <span className="muted">
                      · {t.fields.map((f) => `${f}: ${t.before[f] || '—'} → ${t.after[f] || '—'}`).join(' · ')}
                    </span>
                  </div>
                ))}
                {c.diff.removed.map((t) => (
                  <div key={t.task_id} className="ctx__change ctx__change--removed">
                    <Minus size={12} /> <code>{t.task_id}</code> {t.name}
                  </div>
                ))}
                {!c.diff.added.length && !c.diff.changed.length && !c.diff.removed.length && (
                  <div className="small muted">
                    Layout or flow changes only — no activity was added, renamed or removed.
                  </div>
                )}
              </div>
            </>
          )}
          {c.quality && (
            <div className="ctx__quality">
              <Ring value={Math.round((100 * c.quality.filter((q) => q.ok).length) / c.quality.length)} size={64} />
              <div>
                <h4>Process quality checks</h4>
                <div className="ctx__qlist">
                  {c.quality.map((q) => (
                    <span key={q.id} className={q.ok ? 'q-ok' : 'q-bad'} title={q.detail}>
                      {q.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {q.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {c?.entity_type === 'kpi_target' && c.target && (
        <div className="ctx">
          <h4>
            {c.target.kpi} · {c.target.kpi_name}
          </h4>
          <div className="target-compare">
            <div>
              <span className="muted small">Live target</span>
              {c.live_target ? (
                <>
                  <strong>
                    {c.live_target.green} / {c.live_target.amber} {c.target.unit}
                  </strong>
                  <span className="small muted">{c.live_target.period} · green / amber</span>
                </>
              ) : (
                <strong>none</strong>
              )}
            </div>
            <ArrowRight size={20} className="muted" />
            <div className="is-new">
              <span className="muted small">Proposed</span>
              <strong>
                {c.target.green} / {c.target.amber} {c.target.unit}
              </strong>
              <span className="small muted">
                {c.target.period} · {c.target.direction === 'higher' ? 'higher is better' : 'lower is better'}
              </span>
            </div>
            <div>
              <span className="muted small">Latest actual</span>
              <strong>{c.target.actual ?? '—'}</strong>
              <span className="small muted">baseline {c.target.baseline ?? '—'}</span>
            </div>
          </div>
          {c.target.reason && <p className="small">Reason: {c.target.reason}</p>}
        </div>
      )}

      {c?.entity_type === 'service' && c.service && (
        <div className="ctx">
          <h4>
            {c.service.service_id} · {c.service.name}
          </h4>
          <p className="small">{c.service.description}</p>
          <div className="small">
            Owner: {c.service.owner || '—'} · SLA: {c.service.sla || 'not committed'}
          </div>
          <div className="small">
            Delivered by: {c.service.task_ids.join(', ') || '—'} · Measured by: {c.service.kpis.join(', ') || '—'}
          </div>
          {c.service.open_issues.map((i) => (
            <div key={i} className="alert alert--warn small">
              <AlertTriangle size={13} /> {i}
            </div>
          ))}
        </div>
      )}

      {req.status === 'pending' ? (
        <div className="decision">
          <ErrorBox error={decide.error ?? withdraw.error} />
          {req.can_decide ? (
            <>
              <label className="field">
                <span>Decision note (required to reject)</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={1000}
                  placeholder="What did you check? What must change?"
                />
              </label>
              <div className="decision__actions">
                <button
                  className="btn btn--bad"
                  disabled={decide.isPending || !comment.trim()}
                  onClick={() => decide.mutate(false)}
                >
                  <X size={15} /> Reject
                </button>
                <button className="btn btn--ok" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                  <Check size={15} /> Approve
                </button>
              </div>
            </>
          ) : (
            <div className="alert alert--info small">
              {req.submitted_label === me
                ? 'You submitted this request — another approver must decide (maker-checker).'
                : 'Deciding requires the Approver role.'}
            </div>
          )}
          {req.submitted_label === me && (
            <button className="btn btn--ghost btn--sm" onClick={() => withdraw.mutate(undefined)}>
              <Undo2 size={13} /> Withdraw request
            </button>
          )}
        </div>
      ) : (
        <div className="decision decision--done">
          <Badge>{req.status}</Badge> by {req.decided_label} · {fmtDateTime(req.decided_at)}
          {req.decision_comment && <blockquote className="quote">“{req.decision_comment}”</blockquote>}
        </div>
      )}
    </article>
  );
}

function Policy() {
  const rows = [
    [
      'Process model version (As-Is / To-Be)',
      'Editor',
      'Approver (process owner)',
      'Previous approved version of the same kind is retired; To-Be approval re-syncs the L4 activities.',
    ],
    [
      'KPI target',
      'Editor',
      'Approver',
      'Becomes the active target for the period; an older active target for the same period expires.',
    ],
    [
      'Catalog service',
      'Editor',
      'Approver',
      'Published in the catalog; generated services keep their open issues visible.',
    ],
  ];
  return (
    <section className="grid grid--2">
      <div className="card">
        <h3>What is governed</h3>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Change</th>
                <th>Maker</th>
                <th>Checker</th>
                <th>On approval</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => (
                    <td key={i} className={i === 3 ? 'small' : ''}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h3>Rules enforced by the platform</h3>
        <ul className="rules">
          <li>
            <ShieldCheck size={15} /> The submitter can never approve their own request (checked on the server).
          </li>
          <li>
            <ShieldCheck size={15} /> Only one open request per item; only drafts can be edited or submitted.
          </li>
          <li>
            <ShieldCheck size={15} /> A rejection needs a written reason and returns the item to Draft.
          </li>
          <li>
            <ShieldCheck size={15} /> Approved versions are never edited — a change always starts a new version.
          </li>
          <li>
            <ShieldCheck size={15} /> Requests waiting more than 5 days are flagged as overdue.
          </li>
          <li>
            <ShieldCheck size={15} /> Every submission and decision is written to the immutable audit trail.
          </li>
        </ul>
      </div>
    </section>
  );
}
