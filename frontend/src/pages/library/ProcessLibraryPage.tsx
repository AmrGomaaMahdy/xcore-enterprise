import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { useNode, useTree } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, PageHeader, Spinner, Tabs } from '@/components/ui';

import { ProcessTree } from './ProcessTree';
import {
  ActivitiesTab,
  DocumentsTab,
  HistoryTab,
  KpisTab,
  LanesTab,
  MainDataTab,
  ModelTab,
  QualityTab,
  RaciTab,
  RisksTab,
  VersionsTab,
} from './ProcessTabs';

type TabId =
  | 'main'
  | 'model'
  | 'activities'
  | 'lanes'
  | 'kpis'
  | 'raci'
  | 'risks'
  | 'documents'
  | 'quality'
  | 'versions'
  | 'history';

export default function ProcessLibraryPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const tree = useTree();
  const firstProcess = tree.data?.find((n) => n.level === 3)?.code;
  const selected = code ?? firstProcess;
  const node = useNode(selected ?? null);
  const { user } = useAuth();
  const canEdit = !!user?.can_edit;
  const [tab, setTab] = useState<TabId>('main');

  if (tree.isLoading) return <Spinner />;
  if (tree.error) return <ErrorBox error={tree.error} />;

  const n = node.data;
  const isProcess = n?.level === 3;
  const tabs: { id: TabId; label: string; count?: number }[] = isProcess
    ? [
        { id: 'main', label: 'Main data' },
        { id: 'model', label: 'Model' },
        { id: 'activities', label: 'Activities (L4)', count: n?.counts.activities },
        { id: 'lanes', label: 'Lanes' },
        { id: 'kpis', label: 'KPIs & targets' },
        { id: 'raci', label: 'RACI' },
        { id: 'risks', label: 'Risks & controls', count: n?.counts.risks },
        { id: 'documents', label: 'Documents', count: n?.counts.documents },
        { id: 'quality', label: 'Quality' },
        { id: 'versions', label: 'Versions', count: n?.counts.versions },
        { id: 'history', label: 'History' },
      ]
    : [
        { id: 'main', label: 'Main data' },
        { id: 'kpis', label: 'KPIs' },
        { id: 'history', label: 'History' },
      ];
  const active = tabs.some((t) => t.id === tab) ? tab : 'main';
  const children = (tree.data ?? []).filter((x) => n && x.parent === n.id);

  return (
    <>
      <PageHeader
        eyebrow="Repository 1 of 3"
        title="Business Process Library"
        subtitle="L0 domain → L1 function → L2 sub-function → L3 process (BPMN 2.0 As-Is / To-Be) → L4 activities. Lanes are sub job families."
      />
      <div className="library">
        <ProcessTree nodes={tree.data ?? []} selected={selected} onSelect={(c) => navigate(`/library/${c}`)} />
        <div>
          {node.isLoading && <Spinner />}
          <ErrorBox error={node.error} />
          {!n && !node.isLoading && <Empty>Select a node in the repository.</Empty>}
          {n && (
            <>
              <div className="breadcrumb">
                {n.path.map((p) => (
                  <span key={p.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={`/library/${p.code}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigate(`/library/${p.code}`);
                      }}
                    >
                      {p.code} {p.name}
                    </a>
                    <ChevronRight size={12} />
                  </span>
                ))}
              </div>
              <div className="card__head">
                <h2>
                  <span className={`lvl lvl--${n.level}`}>L{n.level}</span> <code>{n.code}</code> {n.name}
                </h2>
                <Badge>{n.status}</Badge>
              </div>
              <Tabs tabs={tabs} value={active} onChange={setTab} />
              {active === 'main' && (
                <>
                  <MainDataTab node={n} canEdit={canEdit} />
                  {!isProcess && children.length > 0 && (
                    <section className="card">
                      <h3>Children</h3>
                      <div className="table-wrap" style={{ marginTop: 10 }}>
                        <table>
                          <tbody>
                            {children.map((c) => (
                              <tr key={c.id} className="clickable" onClick={() => navigate(`/library/${c.code}`)}>
                                <td>
                                  <span className={`lvl lvl--${c.level}`}>L{c.level}</span>
                                </td>
                                <td className="mono">{c.code}</td>
                                <td>{c.name}</td>
                                <td className="muted">{c.owner}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
              {active === 'model' && <ModelTab node={n} canEdit={canEdit} />}
              {active === 'activities' && <ActivitiesTab node={n} canEdit={canEdit} />}
              {active === 'lanes' && <LanesTab node={n} canEdit={canEdit} />}
              {active === 'kpis' && <KpisTab node={n} canEdit={canEdit} />}
              {active === 'raci' && <RaciTab node={n} />}
              {active === 'risks' && <RisksTab node={n} canEdit={canEdit} />}
              {active === 'documents' && <DocumentsTab node={n} canEdit={canEdit} />}
              {active === 'quality' && <QualityTab node={n} />}
              {active === 'versions' && <VersionsTab node={n} canEdit={canEdit} />}
              {active === 'history' && <HistoryTab node={n} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
