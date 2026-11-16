import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { useAlignment, useKpis } from '@/api/hooks';
import { Badge, ErrorBox, PageHeader, Select, Spinner } from '@/components/ui';

export default function KpiAlignmentPage() {
  const { data, isLoading, error } = useAlignment();
  const kpis = useKpis();
  const [objective, setObjective] = useState('');
  const [tier, setTier] = useState('');

  const names = useMemo(() => Object.fromEntries((kpis.data ?? []).map((k) => [k.kpi_id, k.name])), [kpis.data]);
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error} />;

  const objName = Object.fromEntries(data.objectives.map((o) => [o.code, o.name]));
  const objectives = data.objectives.filter((o) => !o.is_outcome);
  const kpiIds = [
    ...new Set(data.rows.filter((r) => r.level > 0 && (!tier || String(r.level) === tier)).map((r) => r.kpi_id)),
  ].sort((a, b) => {
    const la = data.rows.find((r) => r.kpi_id === a)!.level;
    const lb = data.rows.find((r) => r.kpi_id === b)!.level;
    return la - lb || a.localeCompare(b);
  });
  const cell = (obj: string, kid: string) => data.rows.find((r) => r.objective === obj && r.kpi_id === kid);
  const chains = data.chains.filter((c) => !objective || c.objective === objective);
  const label = (id: string) => (id.startsWith('OBJ-') ? objName[id] : names[id]) ?? id;

  return (
    <>
      <PageHeader
        eyebrow="Repository 3 of 3"
        title="KPI Relationship & Alignment Matrix"
        subtitle="Objective ↔ function ↔ process ↔ KPI ↔ activity indicator. Contribution is the product of roll-up weights along the path; 'driver' marks explained-by links that influence but do not compute the result."
      />
      <div className="obj-cards">
        {data.objectives.map((o) => (
          <button
            key={o.code}
            className={objective === o.code ? 'obj-card obj-card--active' : 'obj-card'}
            onClick={() => setObjective(objective === o.code ? '' : o.code)}
            title={o.description}
          >
            <div className="obj-card__code">{o.code}</div>
            <div>
              <strong>{o.name}</strong>
            </div>
            <div className="small muted">
              {o.is_outcome
                ? 'Enterprise outcome of OBJ-01…04'
                : `${o.kpis.length} strategic KPI(s): ${o.kpis.join(', ')}`}
            </div>
          </button>
        ))}
      </div>

      <section className="card">
        <div className="card__head">
          <h3>Contribution matrix</h3>
          <Select
            label="Tier"
            value={tier}
            onChange={setTier}
            options={[
              { value: '1', label: 'Functional (L1)' },
              { value: '2', label: 'Sub-functional (L2)' },
              { value: '3', label: 'Process (L3)' },
              { value: '4', label: 'Operational indicator (L4)' },
            ]}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>KPI</th>
                {objectives.map((o) => (
                  <th key={o.code} title={o.name} style={{ minWidth: 130 }}>
                    {o.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpiIds.map((kid) => {
                const any = data.rows.find((r) => r.kpi_id === kid)!;
                return (
                  <tr key={kid}>
                    <td>
                      <span className={`lvl lvl--${Math.min(any.level, 4)}`}>L{any.level}</span> <code>{kid}</code>
                      <div className="small">{any.name}</div>
                    </td>
                    {objectives.map((o) => {
                      const c = cell(o.code, kid);
                      if (!c)
                        return (
                          <td key={o.code} className="muted">
                            —
                          </td>
                        );
                      return (
                        <td key={o.code} title={`${kid} → ${o.code} ${o.name}`}>
                          {c.contribution > 0 ? (
                            <>
                              <div className="bar">
                                <span style={{ width: `${Math.min(100, c.contribution)}%` }} />
                              </div>
                              <span className="small">{c.contribution}%</span>
                            </>
                          ) : (
                            <Badge tone="info">driver</Badge>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3>Line of sight {objective && `· ${objective}`}</h3>
          <span className="small muted">Hover any step for its full name.</span>
        </div>
        {chains.map((c, i) => (
          <div className="chain" key={i}>
            {[c.objective, ...c.path].map((step, j) => (
              <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {j > 0 && <ArrowRight size={12} className="muted" />}
                <span className="chain__step" title={label(step)}>
                  {step}
                </span>
              </span>
            ))}
            <span style={{ marginLeft: 'auto' }}>
              {c.driver ? <Badge tone="info">driver</Badge> : <Badge tone="ok">{c.contribution}%</Badge>}
            </span>
          </div>
        ))}
      </section>
    </>
  );
}
