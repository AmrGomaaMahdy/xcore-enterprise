import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  Layers,
  Plus,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

import type { TreeNode } from '@/api/types';
import { SearchBox } from '@/components/ui';

interface Branch extends TreeNode {
  kids: Branch[];
}

export const LEVEL_META: { name: string; child: string | null; icon: LucideIcon }[] = [
  { name: 'Domain', child: 'function', icon: Building2 },
  { name: 'Function', child: 'sub-function', icon: Layers },
  { name: 'Sub-function', child: 'process', icon: FolderTree },
  { name: 'Process', child: null, icon: Workflow },
];

function build(nodes: TreeNode[]): Branch[] {
  const map = new Map<number, Branch>(nodes.map((n) => [n.id, { ...n, kids: [] }]));
  const roots: Branch[] = [];
  map.forEach((n) => (n.parent && map.get(n.parent) ? map.get(n.parent)!.kids.push(n) : roots.push(n)));
  const sort = (list: Branch[]) => {
    list.sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
    list.forEach((b) => sort(b.kids));
  };
  sort(roots);
  return roots;
}

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const i = text.toLowerCase().indexOf(term);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  );
}

interface Props {
  nodes: TreeNode[];
  selected?: string;
  onSelect: (code: string) => void;
  canEdit: boolean;
  onAdd: (parent: TreeNode | null) => void;
}

export function ProcessTree({ nodes, selected, onSelect, canEdit, onAdd }: Props) {
  const roots = useMemo(() => build(nodes), [nodes]);
  const [open, setOpen] = useState<Set<number>>(() => new Set(nodes.map((n) => n.id)));
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  // newly added nodes start expanded
  useEffect(() => {
    setOpen((s) => {
      const next = new Set(s);
      nodes.forEach((n) => !s.has(n.id) && next.add(n.id));
      return next;
    });
  }, [nodes]);

  const matches = (b: Branch): boolean =>
    !term || `${b.code} ${b.name}`.toLowerCase().includes(term) || b.kids.some(matches);
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const counts = [0, 1, 2, 3].map((l) => nodes.filter((n) => n.level === l).length);

  const render = (list: Branch[], depth = 0) => (
    <ul className={depth ? 'ptree__children' : 'ptree__root'}>
      {list.filter(matches).map((b) => {
        const isOpen = term ? true : open.has(b.id);
        const Icon = LEVEL_META[b.level].icon;
        const active = b.code === selected;
        return (
          <li key={b.id} className={`ptree__item ptree__item--l${b.level}`}>
            <div
              className={active ? 'ptree__row is-active' : 'ptree__row'}
              onClick={() => onSelect(b.code)}
              role="treeitem"
              aria-selected={active}
              aria-expanded={b.kids.length ? isOpen : undefined}
            >
              <button
                className={`ptree__caret ${isOpen ? 'is-open' : ''} ${b.kids.length ? '' : 'is-leaf'}`}
                aria-label={isOpen ? 'Collapse' : 'Expand'}
                tabIndex={b.kids.length ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation();
                  if (b.kids.length) toggle(b.id);
                }}
              >
                <ChevronRight size={14} />
              </button>
              <span className={`ptree__icon ptree__icon--l${b.level}`}>
                <Icon size={14} />
              </span>
              <span className="ptree__text">
                <span className="ptree__name">
                  <Highlight text={b.name} term={term} />
                </span>
                <span className="ptree__code">
                  <Highlight text={b.code} term={term} />
                  {b.level === 3 && b.activity_count ? ` · ${b.activity_count} activities` : ''}
                </span>
              </span>
              {b.level < 3 && (b.child_count ?? b.kids.length) > 0 && (
                <span className="ptree__count">{b.child_count ?? b.kids.length}</span>
              )}
              {b.status !== 'Active' && <span className="ptree__status">{b.status}</span>}
              {canEdit && b.level < 3 && (
                <button
                  className="ptree__add"
                  title={`Add ${LEVEL_META[b.level].child} under ${b.code}`}
                  aria-label={`Add ${LEVEL_META[b.level].child} under ${b.code}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(b);
                  }}
                >
                  <Plus size={13} />
                </button>
              )}
            </div>
            {b.kids.length > 0 && isOpen && render(b.kids, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="ptree" aria-label="Process repository">
      <div className="ptree__head">
        <div>
          <h3>Process repository</h3>
          <div className="ptree__levels">
            {counts.map((c, i) => (
              <span key={i} className={`ptree__lvlchip ptree__lvlchip--l${i}`} title={LEVEL_META[i].name}>
                L{i} <strong>{c}</strong>
              </span>
            ))}
          </div>
        </div>
        {canEdit && (
          <button className="btn btn--sm" onClick={() => onAdd(null)} title="Add a new L0 domain">
            <Plus size={13} /> Domain
          </button>
        )}
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Search code or name" />
      <div className="ptree__tools">
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(new Set(nodes.map((n) => n.id)))}>
          <ChevronsUpDown size={13} /> Expand all
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(new Set())}>
          <ChevronsDownUp size={13} /> Collapse all
        </button>
      </div>
      <div className="ptree__scroll" role="tree">
        {render(roots)}
      </div>
    </aside>
  );
}
