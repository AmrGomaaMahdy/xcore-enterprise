import { ArrowRight, Boxes, GitBranch, Library, Network, ShieldCheck, Sparkles, Target, Workflow } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useOverview } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { Donut, HBars, Ring } from '@/components/charts';
import { Badge, ErrorBox, fmtDateTime, Spinner } from '@/components/ui';

const AUTOMATION_COLORS: Record<string, string> = {
  Manual: 'var(--warn)',
  Workflow: 'var(--info)',
  Assisted: 'var(--accent)',
  Automated: 'var(--ok)',
};
const TIER = ['Strategic', 'Functional', 'Sub-functional', 'Process', 'Operational'];
const TIER_COLOR = ['var(--l0)', 'var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)'];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function OverviewPage() {
  const { data, isLoading, error } = useOverview();
  const { user } = useAuth();
  const navigate = useNavigate();
  if (isLoading) return <Spinner />;
  if (error || !data) return <ErrorBox error={error} />;

  const versionsTotal = Object.values(data.versions).reduce((a, b) => a + b, 0);
  const avgQuality = data.processes.length
    ? Math.round(data.processes.reduce((a, p) => a + p.quality, 0) / data.processes.length)
    : 0;
  const traceablePct = data.activities.total
    ? Math.round((data.activities.traceable / data.activities.total) * 100)
    : 0;

  return (
    <div className="home">
      {/* ------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero__glow" aria-hidden />
        <div className="hero__text">
          <div className="hero__eyebrow">
            <Sparkles size={14} /> Process Hub · X-Core
          </div>
          <h1>
            {greeting()}, {user?.display_name || user?.username}
          </h1>
          <p>
            One governed source for your processes, the KPIs that measure them and the services they deliver — every
            change versioned and approved.
          </p>
          <div className="hero__actions">
            <Link className="btn btn--hero" to="/library">
              <Library size={16} /> Open the process library
            </Link>
            <Link className="btn btn--glass" to="/governance">
              <ShieldCheck size={16} /> Review approvals
              {data.approvals_pending > 0 && <span className="pill">{data.approvals_pending}</span>}
            </Link>
          </div>
        </div>
        <div className="hero__kpis">
          <div className="hero__kpi">
            <Ring value={avgQuality} size={76} />
            <span>Avg. process quality</span>
          </div>
          <div className="hero__kpi">
            <Ring value={traceablePct} size={76} color="var(--gold)" />
            <span>Traceable activities</span>
          </div>
          <div className="hero__kpi hero__kpi--num">
            <strong>{data.kpis.total}</strong>
            <span>KPIs in library</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ hierarchy strip */}
      <section className="strip">
        {[
          { n: data.nodes['0'] ?? 0, l: 'Domains', lvl: 0 },
          { n: data.nodes['1'] ?? 0, l: 'Functions', lvl: 1 },
          { n: data.nodes['2'] ?? 0, l: 'Sub-functions', lvl: 2 },
          { n: data.nodes['3'] ?? 0, l: 'Processes', lvl: 3 },
          { n: data.activities.total, l: 'Activities', lvl: 4 },
        ].map((s, i) => (
          <div key={s.l} className="strip__item">
            <span className={`lvl lvl--${s.lvl}`}>L{s.lvl}</span>
            <div>
              <strong>{s.n}</strong>
              <span>{s.l}</span>
            </div>
            {i < 4 && <ArrowRight size={16} className="strip__arrow" />}
          </div>
        ))}
      </section>

      {/* ------------------------------------------------ repositories */}
      <section className="repo-grid">
        <Link to="/library" className="repo-card repo-card--l0">
          <div className="repo-card__icon">
            <Workflow size={22} />
          </div>
          <div className="repo-card__tag">Repository 1</div>
          <h3>Business Process Library</h3>
          <p>L0–L4 hierarchy, BPMN 2.0 As-Is / To-Be models, lanes as sub job families, risks and quality.</p>
          <div className="repo-card__foot">
            <span>
              <strong>{versionsTotal}</strong> model versions
            </span>
            <ArrowRight size={16} />
          </div>
        </Link>
        <Link to="/kpis" className="repo-card repo-card--l1">
          <div className="repo-card__icon">
            <Target size={22} />
          </div>
          <div className="repo-card__tag">Repository 2</div>
          <h3>Enterprise KPI Library</h3>
          <div className="tierbar">
            {TIER.map((t, i) => {
              const n = data.kpis.by_level[String(i)] ?? 0;
              return (
                <span key={t} style={{ flex: n || 0.3, background: TIER_COLOR[i] }} title={`${t}: ${n}`}>
                  {n || ''}
                </span>
              );
            })}
          </div>
          <div className="repo-card__foot">
            <span>
              <strong>{data.kpis.total}</strong> KPIs across 5 tiers
            </span>
            <ArrowRight size={16} />
          </div>
        </Link>
        <Link to="/kpis/alignment" className="repo-card repo-card--l2">
          <div className="repo-card__icon">
            <GitBranch size={22} />
          </div>
          <div className="repo-card__tag">Repository 3</div>
          <h3>KPI Alignment Matrix</h3>
          <p>Line of sight from the {data.objectives} strategic objectives down to activity indicators.</p>
          <div className="repo-card__foot">
            <span>
              <strong>{data.objectives}</strong> objectives
            </span>
            <ArrowRight size={16} />
          </div>
        </Link>
      </section>

      <div className="home__grid">
        {/* ------------------------------------------------ process portfolio */}
        <section className="card home__portfolio">
          <div className="card__head">
            <h3>Process portfolio</h3>
            <Link to="/library" className="small">
              All processes <ArrowRight size={12} />
            </Link>
          </div>
          <div className="proc-cards">
            {data.processes.map((p) => (
              <button key={p.code} className="proc-card" onClick={() => navigate(`/library/${p.code}`)}>
                <Ring value={p.quality} size={58} />
                <div className="proc-card__body">
                  <div className="proc-card__code">
                    {p.parent} › {p.code}
                    {p.criticality && <Badge tone={p.criticality === 'High' ? 'bad' : 'warn'}>{p.criticality}</Badge>}
                  </div>
                  <strong>{p.name}</strong>
                  <div className="proc-card__meta">
                    <span>{p.activities} activities</span>
                    <span>{p.kpis} KPIs</span>
                    <span>{p.risks} risks</span>
                    <span>To-Be {p.tobe ?? '—'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ governance */}
        <section className="card home__gov">
          <div className="card__head">
            <h3>
              <ShieldCheck size={16} /> Process governance
            </h3>
            <Link to="/governance" className="small">
              Open <ArrowRight size={12} />
            </Link>
          </div>
          <div className="gov-big">
            <strong>{data.approvals_pending}</strong>
            <span>requests waiting for a decision</span>
          </div>
          <HBars
            data={[
              { label: 'Approved', value: data.versions.Approved ?? 0, color: 'var(--ok)' },
              { label: 'In review', value: data.versions['In review'] ?? 0, color: 'var(--warn)' },
              { label: 'Draft', value: data.versions.Draft ?? 0, color: 'var(--info)' },
              { label: 'Retired', value: data.versions.Retired ?? 0, color: 'var(--off)' },
            ]}
          />
          <p className="small muted">Model versions by status · {data.targets.Active ?? 0} active KPI targets</p>
        </section>

        {/* ------------------------------------------------ automation */}
        <section className="card">
          <div className="card__head">
            <h3>Automation of L4 activities</h3>
          </div>
          <Donut
            data={['Manual', 'Workflow', 'Assisted', 'Automated'].map((a) => ({
              label: a,
              value: data.activities.by_automation[a] ?? 0,
              color: AUTOMATION_COLORS[a],
            }))}
            sub="activities"
          />
        </section>

        {/* ------------------------------------------------ domains */}
        <section className="card">
          <div className="card__head">
            <h3>Domains</h3>
          </div>
          <div className="domain-tiles">
            {data.domains.map((d) => (
              <button key={d.code} className="domain-tile" onClick={() => navigate(`/library/${d.code}`)}>
                <span className="domain-tile__code">{d.code}</span>
                <span className="domain-tile__name">{d.name}</span>
                <span className="domain-tile__meta">
                  {d.functions} functions · {d.processes} processes
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ shortcuts + activity */}
        <section className="card">
          <div className="card__head">
            <h3>Quick links</h3>
          </div>
          <div className="quick">
            <Link to="/kpis/cascade">
              <Network size={18} /> KPI hierarchy & cascade
            </Link>
            <Link to="/catalog">
              <Boxes size={18} /> Service catalog ({Object.values(data.services).reduce((a, b) => a + b, 0)})
            </Link>
            <Link to="/impact">
              <ShieldCheck size={18} /> Impact analysis
            </Link>
          </div>
        </section>

        <section className="card home__recent">
          <div className="card__head">
            <h3>Recent changes</h3>
            <Link to="/audit" className="small">
              Audit trail <ArrowRight size={12} />
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
      </div>
    </div>
  );
}
