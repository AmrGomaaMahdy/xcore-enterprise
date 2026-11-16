import { useState } from 'react';
import { Radar } from 'lucide-react';

import { useApi } from '@/api/hooks';
import type { ImpactOptions, ImpactResult } from '@/api/types';
import { Badge, Empty, ErrorBox, PageHeader, Select, Spinner } from '@/components/ui';

const TYPES = [
  { value: 'activity', label: 'Activity (L4)' },
  { value: 'process', label: 'Process / node' },
  { value: 'kpi', label: 'KPI' },
  { value: 'sub_job_family', label: 'Sub job family' },
  { value: 'system', label: 'System' },
];

export default function ImpactPage() {
  const options = useApi<ImpactOptions>(['impact-options'], '/governance/impact/');
  const [type, setType] = useState('activity');
  const [ref, setRef] = useState('');
  const result = useApi<ImpactResult>(['impact'], ref ? '/governance/impact/' : null, { type, ref });

  const o = options.data;
  const refOptions = !o
    ? []
    : type === 'activity'
      ? o.activity.map((a) => ({ value: a.task_id, label: `${a.task_id} · ${a.name} (${a.process__code})` }))
      : type === 'process'
        ? o.process.map((p) => ({ value: p.code, label: `L${p.level} ${p.code} · ${p.name}` }))
        : type === 'kpi'
          ? o.kpi.map((k) => ({ value: k.kpi_id, label: `${k.kpi_id} · ${k.name}` }))
          : type === 'sub_job_family'
            ? o.sub_job_family.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` }))
            : o.system.map((s) => ({ value: s, label: s }));

  return (
    <>
      <PageHeader
        title="Impact analysis"
        subtitle="Before you change an activity, process, KPI, sub job family or system, see everything that depends on it — KPIs measured on it, the tiers and objectives they feed, services, risks, documents and people."
      />
      <div className="toolbar card" style={{ padding: 14 }}>
        <Radar size={18} className="muted" />
        <Select
          label="Change to"
          value={type}
          allLabel={null}
          onChange={(v) => {
            setType(v);
            setRef('');
          }}
          options={TYPES}
        />
        <Select label="Item" value={ref} allLabel="Choose…" onChange={setRef} options={refOptions} />
      </div>
      {!ref && <Empty>Choose what you plan to change.</Empty>}
      {result.isLoading && <Spinner label="Tracing dependencies…" />}
      <ErrorBox error={result.error} />
      {result.data && (
        <>
          <div className="card__head" style={{ marginTop: 16 }}>
            <h2>{result.data.label}</h2>
            <Badge tone={result.data.total ? 'warn' : 'ok'}>{result.data.total} dependent items</Badge>
          </div>
          <div className="grid grid--2">
            {result.data.sections.map((s) => (
              <section key={s.title} className="card" style={{ margin: 0 }}>
                <div className="card__head">
                  <h3>{s.title}</h3>
                  <Badge
                    tone={
                      s.count === 0
                        ? 'muted'
                        : s.severity === 'high'
                          ? 'bad'
                          : s.severity === 'medium'
                            ? 'warn'
                            : 'info'
                    }
                  >
                    {s.count}
                  </Badge>
                </div>
                {s.items.length === 0 ? (
                  <p className="muted small">None.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {s.items.map((item, i) => (
                      <li key={i} className="small">
                        {Object.values(item)
                          .filter((v) => v !== null && v !== '')
                          .map(String)
                          .join(' · ')}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
