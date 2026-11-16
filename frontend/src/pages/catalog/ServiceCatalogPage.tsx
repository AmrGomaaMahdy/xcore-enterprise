import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Send, Sparkles, Wand2 } from 'lucide-react';

import { api } from '@/api/client';
import { useAction, useApi, useServices } from '@/api/hooks';
import type { Candidate, GeneratorMeta, Service } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, KV, Modal, PageHeader, SearchBox, Select, Spinner, Tabs } from '@/components/ui';

export default function ServiceCatalogPage() {
  const [tab, setTab] = useState<'catalog' | 'generator'>('catalog');
  return (
    <>
      <PageHeader
        title="Service Catalog"
        subtitle="Business services traced to the To-Be activities that deliver them and the KPIs that measure them — plus a governed generator that proposes new entries from approved models."
      />
      <Tabs
        tabs={[
          { id: 'catalog', label: 'Catalog' },
          { id: 'generator', label: 'Generator' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'catalog' ? <Catalog /> : <Generator />}
    </>
  );
}

function Catalog() {
  const { data, isLoading, error } = useServices();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<Service | null>(null);
  if (isLoading) return <Spinner />;
  const rows = (data ?? []).filter(
    (s) =>
      (!status || s.status === status) &&
      (!q || `${s.service_id} ${s.name} ${s.owner}`.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <>
      <ErrorBox error={error} />
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search services" />
        <Select
          label="Status"
          value={status}
          onChange={setStatus}
          options={['Draft', 'In review', 'Approved', 'Retired'].map((s) => ({ value: s, label: s }))}
        />
      </div>
      {!rows.length ? (
        <Empty>No services match.</Empty>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Process</th>
                <th>Category</th>
                <th>Delivered by</th>
                <th>KPIs</th>
                <th>SLA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setOpen(s)}>
                  <td>
                    <code>{s.service_id}</code>
                    <div>
                      <strong>{s.name}</strong> {s.generated && <Sparkles size={12} className="muted" />}
                    </div>
                    <div className="small muted">{s.owner}</div>
                  </td>
                  <td className="small">
                    {s.process_code} · {s.process_name}
                  </td>
                  <td>{s.category}</td>
                  <td className="small mono">{s.task_ids.join(', ')}</td>
                  <td className="small mono">{s.kpis.join(', ')}</td>
                  <td>{s.sla || <Badge tone="warn">not committed</Badge>}</td>
                  <td>
                    <Badge>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <ServiceModal service={open} canEdit={!!user?.can_edit} onClose={() => setOpen(null)} />}
    </>
  );
}

function ServiceModal({ service: s, canEdit, onClose }: { service: Service; canEdit: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ owner: s.owner, sla: s.sla, description: s.description, channel: s.channel });
  const editable = canEdit && s.status === 'Draft';
  const inv = [['services'], ['approvals']];
  const save = useAction(() => api.patch(`/catalog/services/${s.id}/`, form), inv);
  const submit = useAction(async () => {
    await api.patch(`/catalog/services/${s.id}/`, form);
    await api.post(`/catalog/services/${s.id}/submit/`, {});
  }, inv);
  return (
    <Modal
      wide
      title={`${s.service_id} · ${s.name}`}
      onClose={onClose}
      footer={
        editable && (
          <>
            <button
              className="btn btn--ghost"
              disabled={save.isPending}
              onClick={() => save.mutate(undefined, { onSuccess: onClose })}
            >
              Save draft
            </button>
            <button
              className="btn"
              disabled={submit.isPending}
              onClick={() => submit.mutate(undefined, { onSuccess: onClose })}
            >
              <Send size={14} /> Submit for publication
            </button>
          </>
        )
      }
    >
      <ErrorBox error={save.error ?? submit.error} />
      {s.open_issues.length > 0 && (
        <div className="alert alert--warn">
          <AlertTriangle size={15} /> Open issues: {s.open_issues.join(' · ')}
        </div>
      )}
      <KV
        rows={[
          ['Status', <Badge key="s">{s.status}</Badge>],
          ['Process', `${s.process_code} · ${s.process_name}`],
          ['Category', s.category],
          ['Requester', s.requester],
          ['Trigger', s.trigger],
          ['Inputs', s.inputs],
          ['Output', s.output],
          ['Delivered by', s.activities.map((a) => `${a.task_id} ${a.name}`).join(' · ')],
          ['Measured by', s.kpis.join(' · ')],
          ['Source version', s.source_version],
          ['Generated', s.generated ? `yes · confidence ${s.confidence}%` : 'no'],
        ]}
      />
      {editable ? (
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Service owner</span>
            <input value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
          </label>
          <label className="field">
            <span>SLA (committed by owner)</span>
            <input
              value={form.sla}
              onChange={(e) => setForm({ ...form, sla: e.target.value })}
              placeholder="e.g. 4 working days"
            />
          </label>
          <label className="field">
            <span>Channel</span>
            <input value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            <span>Description</span>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
        </div>
      ) : (
        <KV
          rows={[
            ['Owner', s.owner],
            ['SLA', s.sla],
            ['Channel', s.channel],
            ['Description', s.description],
          ]}
        />
      )}
    </Modal>
  );
}

const VERDICT: Record<Candidate['verdict'], { label: string; tone: string }> = {
  service: { label: 'New service', tone: 'ok' },
  enhance: { label: 'Enhance existing', tone: 'info' },
  activity: { label: 'Activity — not a service', tone: 'muted' },
};

function Generator() {
  const meta = useApi<GeneratorMeta>(['generator-meta'], '/catalog/generator/');
  const [process, setProcess] = useState('');
  const run = useApi<{ process: string; source_version: string; candidates: Candidate[] }>(
    ['generator'],
    process ? '/catalog/generator/' : null,
    { process },
  );
  const { user } = useAuth();
  const [adopt, setAdopt] = useState<Candidate | null>(null);

  return (
    <>
      <section className="grid grid--2">
        <div className="card">
          <h3>Generation rules</h3>
          {(meta.data?.rules ?? []).map(([t, d], i) => (
            <div key={t} className="check">
              <span className="lvl lvl--1">{i + 1}</span>
              <div>
                <strong>{t}</strong>
                <div className="small muted">{d}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Pipeline</h3>
          {(meta.data?.pipeline ?? []).map((p) => (
            <div key={p.t} className="check">
              <span aria-hidden>{p.ic}</span>
              <div>
                <strong>{p.t}</strong>
                <div className="small muted">{p.d}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card__head">
          <h3>
            <Wand2 size={16} /> Propose services from an approved To-Be model
          </h3>
          <Select
            label="Process"
            value={process}
            onChange={setProcess}
            allLabel="Choose…"
            options={(meta.data?.processes ?? []).map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))}
          />
        </div>
        {run.isLoading && <Spinner label="Analysing the To-Be model…" />}
        <ErrorBox error={run.error} />
        {run.data && (
          <>
            <p className="small muted">
              Source: {run.data.process} {run.data.source_version} · {run.data.candidates.length} candidates. Nothing is
              published until a process owner and an approver accept it.
            </p>
            <div className="grid grid--2">
              {run.data.candidates.map((c) => (
                <article key={c.key} className="card" style={{ margin: 0 }}>
                  <div className="card__head" style={{ marginBottom: 6 }}>
                    <strong>{c.name}</strong>
                    <Badge tone={VERDICT[c.verdict].tone}>{VERDICT[c.verdict].label}</Badge>
                  </div>
                  <div className="small muted">
                    {c.category} · confidence {c.confidence}% {c.existing_service && `· matches ${c.existing_service}`}
                  </div>
                  <p className="small">{c.description || c.reason}</p>
                  <div className="small">
                    <strong>Evidence:</strong>{' '}
                    {c.evidence.length ? (
                      c.evidence.map((e) => `${e.task_id} ${e.name}`).join(' · ')
                    ) : (
                      <span className="muted">none found</span>
                    )}
                  </div>
                  {c.kpis.length > 0 && (
                    <div className="small" style={{ marginTop: 4 }}>
                      <strong>Measures:</strong>{' '}
                      {c.kpis.map((k) => (k.kpi_id ? `${k.label} (${k.kpi_id})` : k.label)).join(' · ')}
                    </div>
                  )}
                  {c.flags.map((f) => (
                    <div key={f} className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>
                      <AlertTriangle size={12} /> {f}
                    </div>
                  ))}
                  {c.verdict === 'service' && user?.can_edit && (
                    <button className="btn btn--sm" style={{ marginTop: 10 }} onClick={() => setAdopt(c)}>
                      <CheckCircle2 size={13} /> Adopt as draft
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {adopt && <AdoptModal process={process} cand={adopt} onClose={() => setAdopt(null)} />}
    </>
  );
}

function AdoptModal({ process, cand, onClose }: { process: string; cand: Candidate; onClose: () => void }) {
  const prefix = process === '15-028' ? 'RFX' : 'PO';
  const [serviceId, setServiceId] = useState(`SVC-${prefix}-`);
  const adopt = useAction(
    () => api.post(`/catalog/generator/${process}/adopt/`, { key: cand.key, service_id: serviceId }),
    [['services'], ['generator']],
  );
  return (
    <Modal
      title={`Adopt “${cand.name}”`}
      onClose={onClose}
      footer={
        <button
          className="btn"
          disabled={adopt.isPending}
          onClick={() => adopt.mutate(undefined, { onSuccess: onClose })}
        >
          Create draft
        </button>
      }
    >
      <ErrorBox error={adopt.error} />
      <label className="field">
        <span>Service id (SVC-&lt;area&gt;-nn)</span>
        <input value={serviceId} onChange={(e) => setServiceId(e.target.value.toUpperCase())} />
      </label>
      <p className="small muted">
        The draft keeps the open issues (owner, SLA) visible until the service owner commits to them.
      </p>
    </Modal>
  );
}
