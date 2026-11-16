import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Printer, Scale } from 'lucide-react';

import { api } from '@/api/client';
import { useAction, useKpis, useObjectives, useTree } from '@/api/hooks';
import type { Kpi } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, ErrorBox, KV, Modal, PageHeader, SearchBox, Select, Spinner, Stat } from '@/components/ui';

export const TIERS = ['Strategic KPI', 'Functional KPI', 'Sub-functional KPI', 'Process KPI', 'Operational indicator'];
const NAMING = [
  ['Objective', 'OBJ-nn'],
  ['Enterprise outcome', 'ENT-KPI-nn'],
  ['Strategic (L0)', '<domain>-KPI-nn'],
  ['Functional (L1)', '<function>-KPI-nn'],
  ['Sub-functional (L2)', '<sub-function>-KPI-nn'],
  ['Process (L3)', '<process>-KPI-nn'],
  ['Operational indicator (L4)', '<process>-OI-nn'],
];

export default function KpiLibraryPage() {
  const kpis = useKpis();
  const objectives = useObjectives();
  const tree = useTree();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [domain, setDomain] = useState('');
  const [calc, setCalc] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [weights, setWeights] = useState<Kpi | null>(null);

  const domains = useMemo(() => (tree.data ?? []).filter((n) => n.level === 0), [tree.data]);
  const list = useMemo(
    () =>
      (kpis.data ?? []).filter(
        (k) =>
          (!tier || k.tier.startsWith(tier)) &&
          (!domain || k.domain === domain) &&
          (!calc || k.calc_type === calc) &&
          (!q || `${k.kpi_id} ${k.name} ${k.definition} ${k.owner}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [kpis.data, tier, domain, calc, q],
  );

  if (kpis.isLoading) return <Spinner />;
  if (kpis.error) return <ErrorBox error={kpis.error} />;

  // Domain KPIs first, then by domain order
  const byDomain = domains
    .map((d) => ({ d, items: list.filter((k) => k.domain === d.code) }))
    .filter((g) => g.items.length);
  const toggle = (code: string) =>
    setClosed((s) => (s.has(code) ? new Set([...s].filter((x) => x !== code)) : new Set([...s, code])));

  return (
    <>
      <PageHeader
        eyebrow="Repository 2 of 3"
        title="Enterprise KPI Library"
        subtitle="The single reference book of KPIs: definition, formula, unit, direction, calculation type, owner, source and where each KPI is measured — cascaded through five tiers."
        actions={
          <button className="btn btn--ghost" onClick={() => window.print()}>
            <Printer size={15} /> Print
          </button>
        }
      />
      <div className="grid grid--stats">
        {TIERS.map((t, i) => (
          <Stat
            key={t}
            label={t}
            value={(kpis.data ?? []).filter((k) => k.level === i).length}
            tone={i === 0 ? 'gold' : undefined}
          />
        ))}
        <Stat label="Strategic objectives" value={objectives.data?.length ?? 0} />
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <h3>Strategic objectives</h3>
        </div>
        <div className="obj-cards">
          {(objectives.data ?? []).map((o) => (
            <div key={o.code} className="obj-card" title={o.description}>
              <div className="obj-card__code">{o.code}</div>
              <div>
                <strong>{o.name}</strong>
              </div>
              <div className="small muted">{o.is_outcome ? 'Outcome of OBJ-01 … OBJ-04' : o.description}</div>
            </div>
          ))}
        </div>
        <details>
          <summary className="small">Naming convention</summary>
          <KV rows={NAMING.map(([a, b]) => [a, <code key={a}>{b}</code>])} />
        </details>
      </section>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <SearchBox value={q} onChange={setQ} placeholder="Filter by KPI name, id, owner" />
        <Select label="Tier" value={tier} onChange={setTier} options={TIERS.map((t) => ({ value: t, label: t }))} />
        <Select
          label="Domain"
          value={domain}
          onChange={setDomain}
          options={domains.map((d) => ({ value: d.code, label: `${d.code} · ${d.name}` }))}
        />
        <Select
          label="Calculation"
          value={calc}
          onChange={setCalc}
          options={['Measured', 'Derived', 'Gate', 'Direct'].map((c) => ({ value: c, label: c }))}
        />
        <span className="muted small">{list.length} KPIs</span>
      </div>

      {byDomain.map(({ d, items }) => (
        <section key={d.code} className="panel">
          <button className="panel__head" onClick={() => toggle(d.code)} aria-expanded={!closed.has(d.code)}>
            {closed.has(d.code) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
            <span className="lvl lvl--0">L0</span>
            <h3>
              {d.code} · {d.name}
            </h3>
            <Badge tone="info">{items.length} KPIs</Badge>
          </button>
          {!closed.has(d.code) && (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th />
                    <th>KPI</th>
                    <th>Tier</th>
                    <th>Owner node</th>
                    <th>Unit</th>
                    <th>Direction</th>
                    <th>Calculation</th>
                    <th>Objective</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => (
                    <Fragment key={k.kpi_id}>
                      <tr className="clickable" onClick={() => setOpenRow(openRow === k.kpi_id ? null : k.kpi_id)}>
                        <td>{openRow === k.kpi_id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td>
                          <code>{k.kpi_id}</code>
                          <div>
                            <strong>{k.name}</strong>
                          </div>
                        </td>
                        <td>
                          <Badge tone={`l${Math.min(k.level, 4)}`}>{k.tier}</Badge>
                        </td>
                        <td className="small">
                          {k.node_code} · {k.node_name}
                        </td>
                        <td>{k.unit}</td>
                        <td className="small">
                          {k.direction === 'higher' ? '↑ higher is better' : '↓ lower is better'}
                        </td>
                        <td>{k.calc_type}</td>
                        <td>
                          {k.objective ? <Badge tone="warn">{k.objective}</Badge> : <span className="muted">—</span>}
                        </td>
                      </tr>
                      {openRow === k.kpi_id && (
                        <tr>
                          <td />
                          <td colSpan={7}>
                            <KpiDetail kpi={k} />
                            {user?.can_edit && (k.calc_type === 'Derived' || k.calc_type === 'Gate') && (
                              <button className="btn btn--ghost btn--sm" onClick={() => setWeights(k)}>
                                <Scale size={13} /> Edit roll-up weights
                              </button>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {weights && <WeightsModal kpi={weights} all={kpis.data ?? []} onClose={() => setWeights(null)} />}
    </>
  );
}

export function KpiDetail({ kpi: k, metadataOnly = false }: { kpi: Kpi; metadataOnly?: boolean }) {
  return (
    <>
      <p>{k.definition}</p>
      <KV
        rows={[
          ['Formula', k.formula],
          ['Source', k.source],
          ['Owner', k.owner],
          ['Measured on', k.from_task ? `${k.from_task}${k.to_task ? ` → ${k.to_task}` : ''}` : ''],
          ['Rolls up from', k.rolls_up.map((r) => `${r.kpi_id} (${Number(r.weight)}%)`).join(' · ')],
          ['Explained by', k.explained_by.join(' · ')],
          ['Feeds', k.used_by.map((u) => `${u.kpi_id}${u.relation === 'explains' ? ' (driver)' : ''}`).join(' · ')],
          ...(metadataOnly
            ? []
            : ([
                [
                  'Company target',
                  k.target ? `${k.target.period}: green ${k.target.green} · amber ${k.target.amber} ${k.unit}` : '',
                ],
              ] as [string, string][])),
        ]}
      />
    </>
  );
}

function WeightsModal({ kpi, all, onClose }: { kpi: Kpi; all: Kpi[]; onClose: () => void }) {
  const [rows, setRows] = useState<{ kpi_id: string; weight: number }[]>(
    kpi.rolls_up.map((r) => ({ kpi_id: r.kpi_id, weight: Number(r.weight) })),
  );
  const [add, setAdd] = useState('');
  const save = useAction(
    () =>
      api.put(`/kpis/library/${kpi.kpi_id}/weights/`, {
        weights: Object.fromEntries(rows.map((r) => [r.kpi_id, r.weight])),
      }),
    [['kpis'], ['alignment'], ['cascade']],
  );
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  const candidates = all.filter(
    (k) => k.level > kpi.level && !k.is_outcome && !rows.some((r) => r.kpi_id === k.kpi_id),
  );
  return (
    <Modal
      title={`Roll-up weights · ${kpi.kpi_id}`}
      onClose={onClose}
      footer={
        <>
          <span className={total === 100 || kpi.calc_type === 'Gate' ? 'muted' : 'check__icon--bad'}>
            Total {total}%
          </span>
          <button
            className="btn"
            disabled={save.isPending || !rows.length}
            onClick={() => save.mutate(undefined, { onSuccess: onClose })}
          >
            Save weights
          </button>
        </>
      }
    >
      <ErrorBox error={save.error} />
      <p className="small muted">
        {kpi.calc_type === 'Derived'
          ? 'Derived KPIs are a weighted average — weights must add up to 100.'
          : 'Gate KPIs take the worst contributor; weights are informative.'}
      </p>
      <table>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.kpi_id}>
              <td className="mono">{r.kpi_id}</td>
              <td>{all.find((k) => k.kpi_id === r.kpi_id)?.name}</td>
              <td style={{ width: 110 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={r.weight}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
                  }
                />
              </td>
              <td>
                <button className="btn btn--ghost btn--sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <select value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add contributor">
          <option value="">Add contributor…</option>
          {candidates.map((k) => (
            <option key={k.kpi_id} value={k.kpi_id}>
              {k.kpi_id} · {k.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn--ghost btn--sm"
          disabled={!add}
          onClick={() => {
            setRows([...rows, { kpi_id: add, weight: 0 }]);
            setAdd('');
          }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
