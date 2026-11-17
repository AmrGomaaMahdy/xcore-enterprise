import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowDown, ArrowUp, Crosshair, MousePointerClick, X } from 'lucide-react';

import { useCascade, useKpis, useTree } from '@/api/hooks';
import type { Cascade, CascadeNode } from '@/api/types';
import {
  Badge,
  ErrorBox,
  FullscreenButton,
  PageHeader,
  SearchBox,
  Select,
  Spinner,
  useFullscreen,
} from '@/components/ui';

import { KpiDetail, TIERS } from './KpiLibraryPage';

const LEVEL_COLOR = ['var(--l0)', 'var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)'];
const TIER_SHORT = ['Strategic', 'Functional', 'Sub-functional', 'Process', 'Operational'];
const GAP_X = 236;
const GAP_Y = 200;

type FocusState = 'focus' | 'up' | 'down' | 'dim' | 'match' | 'normal';
type KpiNodeData = CascadeNode & { state: FocusState; contributors: number; feeds: number; order: number } & Record<
    string,
    unknown
  >;

function KpiNodeView({ data }: NodeProps<Node<KpiNodeData>>) {
  return (
    <div
      className={`kpi-node kpi-node--${data.state}`}
      style={{
        ['--lvl-color' as string]: LEVEL_COLOR[Math.min(data.level, 4)],
        ['--delay' as string]: `${data.level * 90 + data.order * 18}ms`,
      }}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="kpi-node__top">
        <span className="kpi-node__tier">L{data.level}</span>
        <span className="kpi-node__id">{data.id}</span>
        <span className={`kpi-node__calc kpi-node__calc--${data.calc_type.toLowerCase()}`}>{data.calc_type}</span>
      </div>
      <div className="kpi-node__name">{data.name}</div>
      <div className="kpi-node__foot">
        {data.contributors > 0 && (
          <span title="Contributors">
            <ArrowDown size={10} /> {data.contributors}
          </span>
        )}
        {data.feeds > 0 && (
          <span title="Feeds">
            <ArrowUp size={10} /> {data.feeds}
          </span>
        )}
        {data.objective && <span className="kpi-node__obj">{data.objective}</span>}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { kpi: KpiNodeView };

function walk(start: string, map: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(map.get(start) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(map.get(id) ?? []));
  }
  return seen;
}

/** All chains from a top-level KPI down to `id`. */
function chainsTo(id: string, up: Map<string, string[]>, guard = new Set<string>()): string[][] {
  const parents = (up.get(id) ?? []).filter((p) => !guard.has(p));
  if (!parents.length) return [[id]];
  return parents.flatMap((p) => chainsTo(p, up, new Set([...guard, id])).map((c) => [...c, id]));
}

function useGraph(data: Cascade | undefined) {
  return useMemo(() => {
    const down = new Map<string, string[]>();
    const up = new Map<string, string[]>();
    const weight = new Map<string, number | null>();
    (data?.edges ?? []).forEach((e) => {
      down.set(e.source, [...(down.get(e.source) ?? []), e.target]);
      up.set(e.target, [...(up.get(e.target) ?? []), e.source]);
      weight.set(`${e.source}>${e.target}`, e.weight);
    });
    // layered layout: each tier ordered by the average x of its parents, rows centred
    const pos = new Map<string, { x: number; y: number; order: number }>();
    const nodes = data?.nodes ?? [];
    const levels = [...new Set(nodes.map((n) => n.level))].sort((a, b) => a - b);
    const widest = Math.max(1, ...levels.map((l) => nodes.filter((n) => n.level === l).length));
    levels.forEach((lvl) => {
      const row = nodes
        .filter((n) => n.level === lvl)
        .map((n) => {
          const xs = (up.get(n.id) ?? []).map((p) => pos.get(p)?.x).filter((x): x is number => x !== undefined);
          return { n, key: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.MAX_SAFE_INTEGER };
        })
        .sort((a, b) => a.key - b.key || a.n.id.localeCompare(b.n.id));
      const offset = ((widest - row.length) * GAP_X) / 2;
      row.forEach(({ n }, i) => pos.set(n.id, { x: offset + i * GAP_X, y: lvl * GAP_Y, order: i }));
    });
    return { up, down, pos, weight };
  }, [data]);
}

function CascadeInner() {
  const cascade = useCascade();
  const kpis = useKpis();
  const tree = useTree();
  const fs = useFullscreen<HTMLDivElement>();
  const flow = useReactFlow();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ domain: '', function: '', sub: '', process: '' });
  const [hover, setHover] = useState<string | null>(null);
  // debounce hover so moving across neighbouring KPIs doesn't make the whole network flicker
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const hoverTo = useCallback((id: string | null) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(id), id ? 140 : 220);
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  const [selected, setSelected] = useState<string | null>(null);
  const { up, down, pos, weight } = useGraph(cascade.data);

  const lineage = useMemo(() => {
    const out: Record<string, string[]> = {};
    const byId = new Map((tree.data ?? []).map((n) => [n.id, n]));
    (tree.data ?? []).forEach((n) => {
      const chain = [n.code];
      let p = n.parent ? byId.get(n.parent) : undefined;
      while (p) {
        chain.unshift(p.code);
        p = p.parent ? byId.get(p.parent) : undefined;
      }
      out[n.code] = chain;
    });
    return out;
  }, [tree.data]);

  const focus = selected ?? hover;
  const ancestors = useMemo(() => (focus ? walk(focus, up) : new Set<string>()), [focus, up]);
  const descendants = useMemo(() => (focus ? walk(focus, down) : new Set<string>()), [focus, down]);

  const term = q.trim().toLowerCase();
  const scope = [filters.process, filters.sub, filters.function, filters.domain].find(Boolean);
  const inScope = useCallback(
    (n: CascadeNode) =>
      (!term || `${n.id} ${n.name}`.toLowerCase().includes(term)) &&
      (!scope || (lineage[n.node] ?? []).includes(scope)),
    [term, scope, lineage],
  );
  const filtered = !!(term || scope);

  const nodes: Node<KpiNodeData>[] = useMemo(
    () =>
      (cascade.data?.nodes ?? []).map((n) => {
        let state: FocusState = 'normal';
        if (focus)
          state = n.id === focus ? 'focus' : ancestors.has(n.id) ? 'up' : descendants.has(n.id) ? 'down' : 'dim';
        else if (filtered) state = inScope(n) ? 'match' : 'dim';
        const p = pos.get(n.id)!;
        return {
          id: n.id,
          type: 'kpi',
          position: { x: p.x, y: p.y },
          data: {
            ...n,
            state,
            order: p.order,
            contributors: (down.get(n.id) ?? []).length,
            feeds: (up.get(n.id) ?? []).length,
          },
        };
      }),
    [cascade.data, focus, ancestors, descendants, filtered, inScope, pos, up, down],
  );

  const edges: Edge[] = useMemo(
    () =>
      (cascade.data?.edges ?? []).map((e) => {
        const onUp =
          focus && (e.target === focus || ancestors.has(e.target)) && (ancestors.has(e.source) || e.source === focus);
        const onDown =
          focus &&
          (e.source === focus || descendants.has(e.source)) &&
          (descendants.has(e.target) || e.target === focus);
        const lit = onUp || onDown;
        const color = onUp ? 'var(--gold)' : onDown ? 'var(--accent)' : 'var(--muted)';
        const faded = (focus && !lit) || (!focus && filtered);
        return {
          id: `${e.source}-${e.target}-${e.relation}`,
          source: e.source,
          target: e.target,
          label: lit ? (e.relation === 'rolls_up' ? `${e.weight}%` : 'driver') : undefined,
          labelStyle: { fill: color, fontWeight: 700, fontSize: 11 },
          labelBgStyle: { fill: 'var(--surface)' },
          animated: !!lit,
          className: lit ? 'edge--lit' : '',
          style: {
            stroke: color,
            strokeWidth: lit ? 3 : 1.2,
            strokeDasharray: e.relation === 'explains' ? '6 4' : undefined,
            opacity: faded ? 0.12 : lit ? 1 : 0.55,
            transition: 'opacity .25s, stroke-width .25s',
          },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        };
      }),
    [cascade.data, focus, ancestors, descendants, filtered],
  );

  // glide the camera to the full path of the selected KPI
  useEffect(() => {
    if (!selected) return;
    const ids = [selected, ...ancestors, ...descendants].map((id) => ({ id }));
    const t = setTimeout(() => flow.fitView({ nodes: ids, duration: 700, padding: 0.2, maxZoom: 1.2 }), 320);
    return () => clearTimeout(t);
  }, [selected, ancestors, descendants, flow]);

  if (cascade.isLoading) return <Spinner />;
  if (cascade.error) return <ErrorBox error={cascade.error} />;

  const byId = new Map((cascade.data?.nodes ?? []).map((n) => [n.id, n]));
  const kpi = kpis.data?.find((k) => k.kpi_id === selected);
  const chains = selected ? chainsTo(selected, up) : [];
  const affectedByTier = [0, 1, 2, 3, 4]
    .map((l) => [...descendants].filter((d) => byId.get(d)?.level === l))
    .filter((g) => g.length);
  const setF = (k: keyof typeof filters) => (v: string) => setFilters({ ...filters, [k]: v });
  const opts = (lvl: number) =>
    (tree.data ?? []).filter((n) => n.level === lvl).map((n) => ({ value: n.code, label: `${n.code} · ${n.name}` }));
  const matches = (cascade.data?.nodes ?? []).filter(inScope);

  return (
    <div ref={fs.ref} className="fs-panel cascade">
      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="Find a KPI by name or id" />
        <Select label="Domain" value={filters.domain} onChange={setF('domain')} options={opts(0)} />
        <Select label="Function" value={filters.function} onChange={setF('function')} options={opts(1)} />
        <Select label="Sub-function" value={filters.sub} onChange={setF('sub')} options={opts(2)} />
        <Select label="Process" value={filters.process} onChange={setF('process')} options={opts(3)} />
        <FullscreenButton on={fs.on} toggle={fs.toggle} />
      </div>
      <div className="cascade__status">
        {focus ? (
          <>
            <Crosshair size={14} /> <strong>{focus}</strong> {byId.get(focus)?.name}
            <span className="pill pill--gold">
              <ArrowUp size={11} /> {ancestors.size} upstream
            </span>
            <span className="pill pill--accent">
              <ArrowDown size={11} /> {descendants.size} contributing
            </span>
            {selected && (
              <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>
                <X size={13} /> Clear focus
              </button>
            )}
          </>
        ) : (
          <>
            <MousePointerClick size={14} /> Hover a KPI to light up its full path; click to lock the focus and open its
            details.
            {filtered && <span className="pill">{matches.length} matching</span>}
            {filtered && matches.length > 0 && (
              <button className="btn btn--ghost btn--sm" onClick={() => setSelected(matches[0].id)}>
                <Crosshair size={13} /> Focus {matches[0].id}
              </button>
            )}
          </>
        )}
        <span className="toolbar__spacer" />
        <span className="legend">
          {TIERS.map((t, i) => (
            <span key={t}>
              <i style={{ background: LEVEL_COLOR[i] }} />L{i}
            </span>
          ))}
          <span>
            <i style={{ background: 'var(--gold)' }} />
            upstream
          </span>
          <span>
            <i style={{ background: 'var(--accent)' }} />
            contributors
          </span>
        </span>
      </div>

      <div className={`cascade__body ${selected ? 'has-panel' : ''}`}>
        <div className="flow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.15}
            nodesConnectable={false}
            nodesDraggable={false}
            onNodeMouseEnter={(_, n) => hoverTo(n.id)}
            onNodeMouseLeave={() => hoverTo(null)}
            onNodeClick={(_, n) => setSelected(n.id === selected ? null : n.id)}
            onPaneClick={() => setSelected(null)}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => LEVEL_COLOR[Math.min((n.data as KpiNodeData).level, 4)]}
              maskColor="rgb(0 0 0 / 8%)"
            />
          </ReactFlow>
        </div>

        {selected && (
          <aside className="cascade__panel">
            <div className="cascade__panel-head">
              <div>
                <Badge tone={`l${Math.min(byId.get(selected)?.level ?? 0, 4)}`}>
                  {TIER_SHORT[byId.get(selected)?.level ?? 0]}
                </Badge>
                <h3>{byId.get(selected)?.name}</h3>
                <code>{selected}</code>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <p className="small muted">{byId.get(selected)?.rule}</p>

            <h4 className="cascade__h">Full path to the top</h4>
            {chains.map((c, i) => (
              <ol key={i} className="path">
                {c.map((id, j) => (
                  <li
                    key={id}
                    className={id === selected ? 'is-focus' : ''}
                    style={{ ['--lvl-color' as string]: LEVEL_COLOR[Math.min(byId.get(id)?.level ?? 0, 4)] }}
                  >
                    <button onClick={() => setSelected(id)}>
                      <code>{id}</code> {byId.get(id)?.name}
                      {j > 0 && weight.get(`${c[j - 1]}>${id}`) != null && (
                        <span className="path__w">{weight.get(`${c[j - 1]}>${id}`)}%</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            ))}

            <h4 className="cascade__h">Contributing KPIs ({descendants.size})</h4>
            {affectedByTier.length === 0 && <p className="small muted">Measured directly — no contributors.</p>}
            {affectedByTier.map((ids) => (
              <div key={ids[0]} className="contrib">
                <span className="contrib__tier">{TIER_SHORT[byId.get(ids[0])?.level ?? 0]}</span>
                <div className="contrib__chips">
                  {ids.map((id) => (
                    <button key={id} className="chip" onClick={() => setSelected(id)} title={byId.get(id)?.name}>
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {kpi && (
              <>
                <h4 className="cascade__h">Definition</h4>
                <KpiDetail kpi={kpi} metadataOnly />
              </>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

export default function KpiCascadePage() {
  return (
    <>
      <PageHeader
        eyebrow="KPI repositories"
        title="KPI hierarchy & cascade"
        subtitle="How KPIs cascade from strategic to operational indicators — definitions and relationships only. Solid lines roll up with a weight; dashed lines are explanatory drivers. Hover or select a KPI to trace its full path."
      />
      <ReactFlowProvider>
        <CascadeInner />
      </ReactFlowProvider>
    </>
  );
}
