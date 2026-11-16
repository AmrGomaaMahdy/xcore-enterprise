import { useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

import { useActivities, useApi, useTree } from '@/api/hooks';
import type { Activity, HeatRow } from '@/api/types';
import { Badge, ErrorBox, KV, Modal, PageHeader, SearchBox, Select, Spinner, Stat } from '@/components/ui';

const LEVELS = ['Manual', 'Workflow', 'Assisted', 'Automated'] as const;
const TONE: Record<string, string> = {
  Manual: 'var(--warn)',
  Workflow: 'var(--info)',
  Assisted: 'var(--accent)',
  Automated: 'var(--ok)',
};

export default function ActivityMapPage() {
  const tree = useTree();
  const [f, setF] = useState({ domain: '', function: '', sub_function: '', process__code: '', automation: '' });
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Activity | null>(null);
  const query = { ...f, in_current_model: true };
  const acts = useActivities(query);
  const heat = useApi<HeatRow[]>(['heatmap'], '/processes/activities/heatmap/', { ...f, automation: undefined });

  const opts = (lvl: number) =>
    (tree.data ?? []).filter((n) => n.level === lvl).map((n) => ({ value: n.code, label: `${n.code} · ${n.name}` }));
  const rows = useMemo(
    () =>
      (acts.data ?? []).filter(
        (a) => !q || `${a.task_id} ${a.name} ${a.system} ${a.lane}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [acts.data, q],
  );
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const total = rows.length || 1;

  return (
    <>
      <PageHeader
        title="Activity automation map"
        subtitle="Where every L4 activity sits on the automation ladder (Manual → Workflow → Assisted → Automated) and whether it leaves a system timestamp — the precondition for measuring process KPIs."
      />
      <div className="toolbar">
        <Select label="Domain" value={f.domain} onChange={set('domain')} options={opts(0)} />
        <Select label="Function" value={f.function} onChange={set('function')} options={opts(1)} />
        <Select label="Sub-function" value={f.sub_function} onChange={set('sub_function')} options={opts(2)} />
        <Select label="Process" value={f.process__code} onChange={set('process__code')} options={opts(3)} />
        <Select
          label="Automation"
          value={f.automation}
          onChange={set('automation')}
          options={LEVELS.map((l) => ({ value: l, label: l }))}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Activity, system, lane" />
      </div>
      <ErrorBox error={acts.error ?? heat.error} />
      <div className="grid grid--stats">
        {LEVELS.map((l) => {
          const n = rows.filter((a) => a.automation === l).length;
          return <Stat key={l} label={l} value={n} hint={`${Math.round((n / total) * 100)}% of activities`} />;
        })}
        <Stat
          label="Traceable"
          value={rows.filter((a) => a.traceable).length}
          tone="gold"
          hint="timestamp in a system"
        />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <h3>Heat map by process</h3>
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table>
            <thead>
              <tr>
                <th>Process</th>
                {LEVELS.map((l) => (
                  <th key={l} className="num">
                    {l}
                  </th>
                ))}
                <th className="num">Traceable</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {(heat.data ?? []).map((h) => (
                <tr key={h.process} className="clickable" onClick={() => set('process__code')(h.process)}>
                  <td>
                    <code>{h.process}</code> {h.name}
                  </td>
                  {LEVELS.map((l) => (
                    <td key={l} className="num">
                      <span
                        className="heat"
                        style={{
                          background: `color-mix(in srgb, ${TONE[l]} ${Math.round((h[l] / (h.total || 1)) * 80) + 6}%, transparent)`,
                        }}
                      >
                        {h[l]}
                      </span>
                    </td>
                  ))}
                  <td className="num">{h.traceable}</td>
                  <td className="num">{h.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h3>Activities</h3>
        {acts.isLoading ? (
          <Spinner />
        ) : (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Activity</th>
                  <th>Process</th>
                  <th>Lane</th>
                  <th>System</th>
                  <th>Automation</th>
                  <th>Traceable</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="clickable" onClick={() => setOpen(a)}>
                    <td className="mono">{a.task_id}</td>
                    <td>{a.name}</td>
                    <td className="mono">{a.process_code}</td>
                    <td>{a.lane}</td>
                    <td>{a.system}</td>
                    <td>
                      <span
                        className="heat"
                        style={{ background: `color-mix(in srgb, ${TONE[a.automation]} 22%, transparent)` }}
                      >
                        {a.automation}
                      </span>
                    </td>
                    <td>{a.traceable && <CheckCircle2 size={16} className="check__icon--ok" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && (
        <Modal title={`${open.task_id} · ${open.name}`} onClose={() => setOpen(null)}>
          <KV
            rows={[
              ['Process', open.process_code],
              ['Sub-process', open.parent_name],
              ['Lane', open.lane],
              ['BPMN type', <code key="t">{open.bpmn_type}</code>],
              ['System', open.system],
              ['Automation', <Badge key="a">{open.automation}</Badge>],
              ['Traceable', open.traceable ? 'Yes — leaves a system timestamp' : 'No'],
              ['Steps', open.steps],
              ['Data in', open.data_in],
              ['Data out', open.data_out],
            ]}
          />
        </Modal>
      )}
    </>
  );
}
