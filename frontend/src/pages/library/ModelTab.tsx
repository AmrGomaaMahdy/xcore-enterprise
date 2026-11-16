import { useMemo, useState } from 'react';
import { ArrowRight, GitBranchPlus, GitCompareArrows, Minus, PencilLine, Plus, Send } from 'lucide-react';

import { api } from '@/api/client';
import { useAction, useApi, useVersion, useVersions } from '@/api/hooks';
import type { ProcessNode, ProcessVersion, VersionDiff } from '@/api/types';
import { Badge, Empty, ErrorBox, fmtDate, Modal, Spinner } from '@/components/ui';

import { BpmnPanel, type DiffMark } from './BpmnPanel';

const fileName = (v: ProcessVersion) => `${v.process_code}_${v.kind}_v${v.version}`.replace(/\s+/g, '_');

export function ModelTab({ node, canEdit }: { node: ProcessNode; canEdit: boolean }) {
  const versions = useVersions(node.code);
  const list = useMemo(() => versions.data ?? [], [versions.data]);
  const live = list.find((v) => v.kind === 'To-Be' && v.status === 'Approved') ?? list[0];
  const [chosen, setChosen] = useState<number | null>(null);
  const id = chosen ?? live?.id ?? null;
  const version = useVersion(id);
  const [ok, setOk] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const inv = [['versions'], ['version'], ['approvals'], ['node'], ['tree']];
  const save = useAction(
    (xml: string) => api.put(`/processes/versions/${id}/model/`, { bpmn_xml: xml }),
    [['version'], ['versions']],
  );
  const draft = useAction(
    (v: ProcessVersion) => api.post<ProcessVersion>(`/processes/versions/${v.id}/new-draft/`, {}),
    inv,
  );
  const submit = useAction((v: ProcessVersion) => api.post(`/processes/versions/${v.id}/submit/`, {}), inv);

  if (versions.isLoading) return <Spinner />;
  if (!list.length) return <Empty>No BPMN model yet.</Empty>;
  const v = list.find((x) => x.id === id);
  const detail = version.data;
  const openDraft = v
    ? list.find((x) => x.kind === v.kind && (x.status === 'Draft' || x.status === 'In review'))
    : undefined;
  const groups = (['To-Be', 'As-Is'] as const).map((k) => ({ kind: k, items: list.filter((x) => x.kind === k) }));

  return (
    <section className="model-tab">
      <aside className="version-rail">
        {groups.map((g) => (
          <div key={g.kind}>
            <div className="version-rail__head">{g.kind}</div>
            {g.items.map((x) => (
              <button
                key={x.id}
                className={`version-chip ${x.id === id ? 'is-active' : ''} version-chip--${x.status.replace(' ', '-').toLowerCase()}`}
                onClick={() => setChosen(x.id)}
              >
                <span className="version-chip__v">v{x.version}</span>
                <Badge>{x.status}</Badge>
                <span className="version-chip__date">{fmtDate(x.approved_at ?? x.created_at)}</span>
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="model-main">
        <div className="model-head">
          <div>
            <div className="model-head__title">
              {v?.kind} model · v{v?.version} <Badge>{v?.status}</Badge>
              {v?.id === live?.id && v?.status === 'Approved' && <Badge tone="ok">live</Badge>}
            </div>
            <div className="small muted">
              {v?.based_on_label ? `Based on ${v.based_on_label} · ` : ''}
              {v?.approved_at
                ? `approved ${fmtDate(v.approved_at)} by ${v.approved_by}`
                : `created ${fmtDate(v?.created_at)}`}
            </div>
            {v?.note && <p className="model-head__note">{v.note}</p>}
          </div>
          <div className="model-head__actions">
            <button className="btn btn--ghost" onClick={() => setCompare(true)} disabled={list.length < 2}>
              <GitCompareArrows size={15} /> Compare versions
            </button>
            {canEdit && v?.status === 'Approved' && !openDraft && (
              <button
                className="btn"
                disabled={draft.isPending}
                onClick={() =>
                  draft.mutate(v, {
                    onSuccess: (d) => {
                      setChosen(d.id);
                      setOk(
                        `New ${d.kind} v${d.version} draft created from v${v.version} — edit it below, then submit for approval.`,
                      );
                    },
                  })
                }
              >
                <GitBranchPlus size={15} /> New version
              </button>
            )}
            {canEdit && openDraft && openDraft.id !== v?.id && (
              <button className="btn btn--ghost" onClick={() => setChosen(openDraft.id)}>
                <PencilLine size={15} /> Open v{openDraft.version} {openDraft.status.toLowerCase()}
              </button>
            )}
            {canEdit && v?.status === 'Draft' && (
              <button
                className="btn"
                disabled={submit.isPending}
                onClick={() =>
                  submit.mutate(v, { onSuccess: () => setOk('Submitted to Process Governance for approval.') })
                }
              >
                <Send size={15} /> Submit for approval
              </button>
            )}
          </div>
        </div>
        <ErrorBox error={save.error ?? draft.error ?? submit.error} />
        {ok && <div className="alert alert--ok">{ok}</div>}
        {detail?.bpmn_xml && v ? (
          <BpmnPanel
            key={detail.id}
            xml={detail.bpmn_xml}
            fileName={fileName(v)}
            editable={canEdit && detail.status === 'Draft'}
            saving={save.isPending}
            onSave={(xml) => save.mutate(xml, { onSuccess: () => setOk('Model saved to the draft.') })}
          />
        ) : (
          <Spinner label="Loading model…" />
        )}
      </div>
      {compare && v && <CompareModal versions={list} initialTarget={v} onClose={() => setCompare(false)} />}
    </section>
  );
}

function CompareModal({
  versions,
  initialTarget,
  onClose,
}: {
  versions: ProcessVersion[];
  initialTarget: ProcessVersion;
  onClose: () => void;
}) {
  const defaultBase =
    versions.find((x) => x.id === initialTarget.based_on) ?? versions.find((x) => x.id !== initialTarget.id)!;
  const [base, setBase] = useState(defaultBase.id);
  const [target, setTarget] = useState(initialTarget.id);
  const diff = useApi<VersionDiff>(['compare', base, target], base !== target ? '/processes/versions/compare/' : null, {
    a: base,
    b: target,
  });
  const a = useVersion(base);
  const b = useVersion(target);
  const d = diff.data;

  const marksA = useMemo<Record<string, DiffMark>>(
    () =>
      Object.fromEntries([
        ...(d?.removed ?? []).map((t) => [t.task_id, 'removed' as const]),
        ...(d?.changed ?? []).map((t) => [t.task_id, 'changed' as const]),
      ]),
    [d],
  );
  const marksB = useMemo<Record<string, DiffMark>>(
    () =>
      Object.fromEntries([
        ...(d?.added ?? []).map((t) => [t.task_id, 'added' as const]),
        ...(d?.changed ?? []).map((t) => [t.task_id, 'changed' as const]),
      ]),
    [d],
  );
  const opt = (x: ProcessVersion) => (
    <option key={x.id} value={x.id}>
      {x.kind} v{x.version} · {x.status}
    </option>
  );

  return (
    <Modal
      wide
      title={
        <span className="modal-title-icon">
          <GitCompareArrows size={18} /> Compare model versions
        </span>
      }
      onClose={onClose}
    >
      <div className="compare-pick">
        <label className="field">
          <span>Base</span>
          <select value={base} onChange={(e) => setBase(Number(e.target.value))}>
            {versions.map(opt)}
          </select>
        </label>
        <ArrowRight size={18} className="muted" />
        <label className="field">
          <span>Compared with</span>
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            {versions.map(opt)}
          </select>
        </label>
        {d && (
          <div className="diff-chips">
            <span className="diff-chip diff-chip--added">
              <Plus size={12} /> {d.added.length} added
            </span>
            <span className="diff-chip diff-chip--changed">~ {d.changed.length} changed</span>
            <span className="diff-chip diff-chip--removed">
              <Minus size={12} /> {d.removed.length} removed
            </span>
            <span className="diff-chip">{d.unchanged} unchanged</span>
          </div>
        )}
      </div>
      {base === target && <div className="alert alert--info">Choose two different versions.</div>}
      <ErrorBox error={diff.error} />
      <div className="compare-grid">
        <div>
          <div className="compare-grid__label">{d?.base.label ?? 'Base'}</div>
          {a.data?.bpmn_xml ? (
            <BpmnPanel key={`a${base}`} xml={a.data.bpmn_xml} compact marks={marksA} height={340} />
          ) : (
            <Spinner />
          )}
        </div>
        <div>
          <div className="compare-grid__label">{d?.target.label ?? 'Target'}</div>
          {b.data?.bpmn_xml ? (
            <BpmnPanel key={`b${target}`} xml={b.data.bpmn_xml} compact marks={marksB} height={340} />
          ) : (
            <Spinner />
          )}
        </div>
      </div>
      {d && (
        <div className="diff-lists">
          <DiffList title="Added activities" tone="added" rows={d.added.map((t) => [t.task_id, t.name, t.lane])} />
          <DiffList
            title="Changed activities"
            tone="changed"
            rows={d.changed.map((c) => [
              c.task_id,
              c.name,
              c.fields.map((f) => `${f}: ${c.before[f] || '—'} → ${c.after[f] || '—'}`).join(' · '),
            ])}
          />
          <DiffList
            title="Removed activities"
            tone="removed"
            rows={d.removed.map((t) => [t.task_id, t.name, t.lane])}
          />
          {(d.lanes_added.length > 0 || d.lanes_removed.length > 0) && (
            <div className="small">
              {d.lanes_added.length > 0 && <div>Lanes added: {d.lanes_added.join(', ')}</div>}
              {d.lanes_removed.length > 0 && <div>Lanes removed: {d.lanes_removed.join(', ')}</div>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function DiffList({ title, tone, rows }: { title: string; tone: DiffMark; rows: string[][] }) {
  if (!rows.length) return null;
  return (
    <div className={`diff-list diff-list--${tone}`}>
      <h4>
        {title} <span className="muted">({rows.length})</span>
      </h4>
      {rows.map((r) => (
        <div key={r[0]} className="diff-list__row">
          <code>{r[0]}</code>
          <span>{r[1]}</span>
          <span className="muted small">{r[2]}</span>
        </div>
      ))}
    </div>
  );
}
