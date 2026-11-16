import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useOverview } from '@/api/hooks';
import { ErrorBox, fmtDateTime, PageHeader, Spinner, Stat } from '@/components/ui';

const LEVELS = ['L0 Domains', 'L1 Functions', 'L2 Sub-functions', 'L3 Processes'];
const AUTOMATION = ['Manual', 'Workflow', 'Assisted', 'Automated'] as const;

export default function OverviewPage() {
  const { data, isLoading, error } = useOverview();
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error} />;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  const autoTotal = data.activities.total || 1;

  return (
    <>
      <PageHeader
        eyebrow="Process Hub"
        title="Business excellence at a glance"
        subtitle="One governed source for processes (L0–L4, BPMN 2.0), the Enterprise KPI Library, its alignment to the five strategic objectives, and the service catalog — all under maker-checker approval."
      />
      <div className="grid grid--stats">
        {LEVELS.map((l, i) => (
          <Stat key={l} label={l} value={data.nodes[String(i)] ?? 0} tone={i === 3 ? 'gold' : undefined} />
        ))}
        <Stat
          label="Activities (L4)"
          value={data.activities.total}
          hint={`${data.activities.traceable} traceable in a system`}
        />
        <Stat
          label="KPIs in library"
          value={data.kpis.total}
          hint={`${data.objectives} strategic objectives`}
          tone="gold"
        />
        <Stat label="Catalog services" value={sum(data.services)} hint={`${data.services.Approved ?? 0} approved`} />
        <Stat
          label="Pending approvals"
          value={data.approvals_pending}
          tone={data.approvals_pending ? 'warn' : undefined}
          hint={<Link to="/approvals">Open queue →</Link>}
        />
      </div>

      <div className="grid grid--2" style={{ marginTop: 16 }}>
        <section className="card">
          <div className="card__head">
            <h3>Automation profile of L4 activities</h3>
            <Link to="/activity-map" className="small">
              Activity automation map <ArrowRight size={12} />
            </Link>
          </div>
          {AUTOMATION.map((a) => {
            const n = data.activities.by_automation[a] ?? 0;
            return (
              <div
                key={a}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '110px 1fr 40px',
                  gap: 10,
                  alignItems: 'center',
                  margin: '8px 0',
                }}
              >
                <span>{a}</span>
                <div className="bar">
                  <span style={{ width: `${(n / autoTotal) * 100}%` }} />
                </div>
                <span className="num">{n}</span>
              </div>
            );
          })}
          <p className="small muted">
            BPMN service, script and business-rule tasks are always Automated; manual tasks are always Manual.
          </p>
        </section>
        <section className="card">
          <div className="card__head">
            <h3>Model versions & targets</h3>
          </div>
          <div className="grid grid--stats">
            {['Approved', 'In review', 'Draft', 'Retired'].map((s) => (
              <Stat key={s} label={`Versions · ${s}`} value={data.versions[s] ?? 0} />
            ))}
            <Stat label="Active targets" value={data.targets.Active ?? 0} />
            <Stat
              label="Sub job families (HCM)"
              value={data.hcm.sub_job_families}
              hint={`${data.hcm.employees} employees`}
            />
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card__head">
          <h3>Recent changes</h3>
          <Link to="/audit" className="small">
            Full audit trail <ArrowRight size={12} />
          </Link>
        </div>
        <ul className="timeline">
          {data.recent.map((r, i) => (
            <li key={i}>
              <div>{r.summary}</div>
              <div className="small muted">
                {fmtDateTime(r.at)} · {r.actor_label} {r.process_code && `· ${r.process_code}`}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
