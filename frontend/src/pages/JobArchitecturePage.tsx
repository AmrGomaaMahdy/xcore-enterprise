import { useApi, useSubJobFamilies } from '@/api/hooks';
import type { Lane } from '@/api/types';
import { Badge, ErrorBox, PageHeader, Spinner } from '@/components/ui';

export default function JobArchitecturePage() {
  const sjf = useSubJobFamilies();
  const lanes = useApi<(Lane & { process: number })[]>(['lanes', 'all'], '/processes/lanes/');
  const tree = useApi<{ id: number; code: string; name: string }[]>(['tree'], '/processes/nodes/tree/');
  if (sjf.isLoading || lanes.isLoading) return <Spinner />;
  const families = [...new Map((sjf.data ?? []).map((s) => [s.job_family, s.job_family_name])).entries()];
  const procName = (id: number) => tree.data?.find((n) => n.id === id)?.code ?? '';

  return (
    <>
      <PageHeader
        title="Job architecture"
        subtitle="Oracle Fusion HCM job families and sub job families (read-only sync). Lanes in process models link to sub job families, and every employee carries one — so activities and KPIs cascade to people without jobs or positions."
      />
      <ErrorBox error={sjf.error ?? lanes.error} />
      <div className="grid grid--2">
        {families.map(([code, name]) => (
          <section key={code} className="card" style={{ margin: 0 }}>
            <div className="card__head">
              <h3>
                <span className="lvl lvl--1">JF</span> {code} · {name}
              </h3>
            </div>
            {(sjf.data ?? [])
              .filter((s) => s.job_family === code)
              .map((s) => {
                const used = (lanes.data ?? []).filter((l) => l.sub_job_family === s.code);
                return (
                  <div key={s.code} className="check">
                    <span className="lvl lvl--2">SJF</span>
                    <div style={{ flex: 1 }}>
                      <strong>
                        {s.code} · {s.name}
                      </strong>
                      <div className="small muted">
                        {used.length
                          ? `Lanes: ${used.map((l) => `${procName(l.process)} ${l.name}`).join(' · ')}`
                          : 'Not used as a lane yet'}
                      </div>
                    </div>
                    <Badge tone="info">{s.employee_count} employees</Badge>
                  </div>
                );
              })}
          </section>
        ))}
      </div>
    </>
  );
}
