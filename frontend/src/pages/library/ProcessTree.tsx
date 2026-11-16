import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

import type { TreeNode } from '@/api/types';
import { SearchBox } from '@/components/ui';

interface Branch extends TreeNode {
  kids: Branch[];
}

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

export function ProcessTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: TreeNode[];
  selected?: string;
  onSelect: (code: string) => void;
}) {
  const roots = useMemo(() => build(nodes), [nodes]);
  const [open, setOpen] = useState<Set<number>>(() => new Set(nodes.map((n) => n.id)));
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const matches = (b: Branch): boolean =>
    !term || `${b.code} ${b.name}`.toLowerCase().includes(term) || b.kids.some(matches);
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const render = (list: Branch[]) => (
    <ul>
      {list.filter(matches).map((b) => {
        const isOpen = term ? true : open.has(b.id);
        return (
          <li key={b.id}>
            <div
              className={b.code === selected ? 'tree__row tree__row--active' : 'tree__row'}
              onClick={() => onSelect(b.code)}
            >
              {b.kids.length ? (
                <button
                  className="icon-btn icon-btn--sm"
                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(b.id);
                  }}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : (
                <span style={{ width: 18 }} />
              )}
              <span className={`lvl lvl--${b.level}`}>L{b.level}</span>
              <span className="tree__code">{b.code}</span>
              <span>{b.name}</span>
            </div>
            {b.kids.length > 0 && isOpen && render(b.kids)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside className="card tree" aria-label="Process repository">
      <h3>Process repository</h3>
      <div className="tree__tools">
        <SearchBox value={q} onChange={setQ} placeholder="Search code or name" />
      </div>
      <div className="tree__tools">
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(new Set(nodes.map((n) => n.id)))}>
          <ChevronsUpDown size={14} /> Expand all
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen(new Set())}>
          <ChevronsDownUp size={14} /> Collapse all
        </button>
      </div>
      {render(roots)}
    </aside>
  );
}
