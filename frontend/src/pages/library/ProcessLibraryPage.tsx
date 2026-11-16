import { useState, type ReactNode } from 'react';
import {
  Activity as ActivityIcon,
  BadgeCheck,
  ChevronRight,
  FileText,
  GitCompareArrows,
  History,
  Info,
  Plus,
  ShieldAlert,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { useNode, useTree } from '@/api/hooks';
import type { TreeNode } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Badge, Empty, ErrorBox, Spinner, Tabs } from '@/components/ui';

import { AddNodeModal } from './AddNodeModal';
import { LEVEL_META, ProcessTree } from './ProcessTree';
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

const I = 15;

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
  const [adding, setAdding] = useState<{ parent: TreeNode | null } | null>(null);

  if (tree.isLoading) return <Spinner />;
  if (tree.error) return <ErrorBox error={tree.error} />;

  const n = node.data;
  const isProcess = n?.level === 3;
  const tabs: { id: TabId; label: string; count?: number; icon?: ReactNode }[] = isProcess
    ? [
        { id: 'main', label: 'Main data', icon: <Info size={I} /> },
        { id: 'model', label: 'Model', icon: <Workflow size={I} /> },
        { id: 'activities', label: 'Activities (L4)', count: n?.counts.activities, icon: <ActivityIcon size={I} /> },
        { id: 'lanes', label: 'Lanes', icon: <Users size={I} /> },
        { id: 'kpis', label: 'KPIs & targets', icon: <Target size={I} /> },
        { id: 'raci', label: 'RACI', icon: <GitCompareArrows size={I} /> },
        { id: 'risks', label: 'Risks & controls', count: n?.counts.risks, icon: <ShieldAlert size={I} /> },
        { id: 'documents', label: 'Documents', count: n?.counts.documents, icon: <FileText size={I} /> },
        { id: 'quality', label: 'Quality', icon: <BadgeCheck size={I} /> },
        { id: 'versions', label: 'Versions', count: n?.counts.versions, icon: <GitCompareArrows size={I} /> },
        { id: 'history', label: 'History', icon: <History size={I} /> },
      ]
    : [
        { id: 'main', label: 'Overview', icon: <Info size={I} /> },
        { id: 'kpis', label: 'KPIs', icon: <Target size={I} /> },
        { id: 'history', label: 'History', icon: <History size={I} /> },
      ];
  const active = tabs.some((t) => t.id === tab) ? tab : 'main';
  const all = tree.data ?? [];
  const children = all.filter((x) => n && x.parent === n.id).sort((a, b) => a.order - b.order);
  const treeNode = all.find((x) => x.code === n?.code) ?? null;
  const meta = n ? LEVEL_META[n.level] : null;
  const childName = meta?.child;
  const Icon = meta?.icon ?? Workflow;

  return (
    <>
      <div className="library">
        <ProcessTree
          nodes={all}
          selected={selected}
          onSelect={(c) => navigate(`/library/${c}`)}
          canEdit={canEdit}
          onAdd={(parent) => setAdding({ parent })}
        />
        <div className="library__main">
          {node.isLoading && <Spinner />}
          <ErrorBox error={node.error} />
          {!n && !node.isLoading && <Empty>Select a node in the repository.</Empty>}
          {n && (
            <>
              {/* ---------------------------------------- node hero */}
              <section className={`node-hero node-hero--l${n.level}`}>
                <div className="node-hero__crumbs">
                  <span className="muted">Business Process Library</span>
                  {n.path.map((p) => (
                    <span key={p.code} className="node-hero__crumb">
                      <ChevronRight size={12} />
                      <a
                        href={`/library/${p.code}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigate(`/library/${p.code}`);
                        }}
                      >
                        {p.code} · {p.name}
                      </a>
                    </span>
                  ))}
                </div>
                <div className="node-hero__main">
                  <span className="node-hero__icon">
                    <Icon size={26} />
                  </span>
                  <div className="node-hero__title">
                    <div className="node-hero__kicker">
                      L{n.level} · {meta?.name} <code>{n.code}</code>
                    </div>
                    <h1>{n.name}</h1>
                    <div className="node-hero__meta">
                      <Badge>{n.status}</Badge>
                      {n.owner && <span>Owner · {n.owner}</span>}
                      {n.owner_job && <span className="mono">{n.owner_job}</span>}
                      {isProcess && n.criticality && (
                        <Badge tone={n.criticality === 'High' ? 'bad' : 'warn'}>{n.criticality} criticality</Badge>
                      )}
                    </div>
                  </div>
                  {canEdit && childName && treeNode && (
                    <button className="btn btn--hero-add" onClick={() => setAdding({ parent: treeNode })}>
                      <Plus size={16} /> Add {childName}
                    </button>
                  )}
                </div>
                <div className="node-hero__stats">
                  {isProcess ? (
                    <>
                      <span>
                        <strong>{n.counts.activities}</strong> activities
                      </span>
                      <span>
                        <strong>{n.counts.versions}</strong> model versions
                      </span>
                      <span>
                        <strong>{n.counts.risks}</strong> risks
                      </span>
                      <span>
                        <strong>{n.counts.documents}</strong> documents
                      </span>
                    </>
                  ) : (
                    <span>
                      <strong>{children.length}</strong> {childName}
                      {children.length === 1 ? '' : childName === 'process' ? 'es' : 's'}
                    </span>
                  )}
                </div>
              </section>

              <Tabs tabs={tabs} value={active} onChange={setTab} />
              {active === 'main' && (
                <>
                  {!isProcess && (
                    <section className="card">
                      <div className="card__head">
                        <h3>
                          {childName
                            ? `${childName[0].toUpperCase()}${childName.slice(1)}${childName === 'process' ? 'es' : 's'}`
                            : 'Children'}{' '}
                          in {n.code}
                        </h3>
                      </div>
                      <div className="child-grid">
                        {children.map((c) => {
                          const CIcon = LEVEL_META[c.level].icon;
                          return (
                            <button
                              key={c.id}
                              className={`child-card child-card--l${c.level}`}
                              onClick={() => navigate(`/library/${c.code}`)}
                            >
                              <span className={`ptree__icon ptree__icon--l${c.level}`}>
                                <CIcon size={16} />
                              </span>
                              <span className="child-card__code">{c.code}</span>
                              <strong>{c.name}</strong>
                              <span className="small muted">
                                {c.level === 3
                                  ? `${c.activity_count ?? 0} activities`
                                  : `${c.child_count ?? 0} ${LEVEL_META[c.level].child === 'process' ? 'processes' : `${LEVEL_META[c.level].child}s`}`}
                                {c.owner && ` · ${c.owner}`}
                              </span>
                            </button>
                          );
                        })}
                        {canEdit && treeNode && childName && (
                          <button
                            className="child-card child-card--add"
                            onClick={() => setAdding({ parent: treeNode })}
                          >
                            <Plus size={22} />
                            <strong>Add {childName}</strong>
                            <span className="small muted">under {n.code}</span>
                          </button>
                        )}
                        {!children.length && !canEdit && <Empty>No {childName}s yet.</Empty>}
                      </div>
                    </section>
                  )}
                  <MainDataTab node={n} canEdit={canEdit} />
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
      {adding && (
        <AddNodeModal
          parent={adding.parent}
          onClose={() => setAdding(null)}
          onCreated={(c) => {
            setAdding(null);
            setTab('main');
            navigate(`/library/${c}`);
          }}
        />
      )}
    </>
  );
}
