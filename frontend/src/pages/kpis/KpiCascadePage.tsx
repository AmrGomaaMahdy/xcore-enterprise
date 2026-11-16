import { useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useCascade, useKpis, useTree } from '@/api/hooks';
import type { CascadeNode } from '@/api/types';
import {
  ErrorBox,
  FullscreenButton,
  Modal,
  PageHeader,
  SearchBox,
  Select,
  Spinner,
  useFullscreen,
} from '@/components/ui';

import { KpiDetail, TIERS } from './KpiLibraryPage';

const LEVEL_COLOR = ['var(--l0)', 'var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)'];
type KpiNodeData = CascadeNode & { dim: boolean } & Record<string, unknown>;

function KpiNodeView({ data }: NodeProps<Node<KpiNodeData>>) {
  return (
    <div
      className={data.dim ? 'kpi-node kpi-node--dim' : 'kpi-node'}
      style={{ ['--lvl-color' as string]: LEVEL_COLOR[Math.min(data.level, 4)] }}
      title={data.rule}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="kpi-node__id">
        {data.id} · {data.calc_type}
      </div>
      <div>
        <strong>{data.name}</strong>
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { kpi: KpiNodeView };

export default function KpiCascadePage() {
  const cascade = useCascade();
  const kpis = useKpis();
  const tree = useTree();
  const fs = useFullscreen<HTMLDivElement>();
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ domain: '', function: '', sub: '', process: '' });
  const [open, setOpen] = useState<string | null>(null);

  // ancestors of every library node (to filter by domain / function / sub-function / process)
  const lineage = useMemo(() => {
    const byId = new Map((tree.data ?? []).map((n) => [n.id, n]));
    const out: Record<string, string[]> = {};
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
  const byLevel = (lvl: number) => (tree.data ?? []).filter((n) => n.level === lvl);

  const { nodes, edges, shown } = useMemo(() => {
    const data = cascade.data;
    if (!data) return { nodes: [], edges: [], shown: 0 };
    const down = new Map<string, string[]>();
    const up = new Map<string, string[]>();
    data.edges.forEach((e) => {
      down.set(e.source, [...(down.get(e.source) ?? []), e.target]);
      up.set(e.target, [...(up.get(e.target) ?? []), e.source]);
    });
    const term = q.trim().toLowerCase();
    const scope = [filters.process, filters.sub, filters.function, filters.domain].find(Boolean);
    const direct = data.nodes.filter(
      (n) =>
        (!term || `${n.id} ${n.name}`.toLowerCase().includes(term)) &&
        (!scope || (lineage[n.node] ?? []).includes(scope)),
    );
    let keep: Set<string> | null = null;
    if (term || scope) {
      keep = new Set<string>();
      const walk = (id: string, map: Map<string, string[]>) => {
        if (keep!.has(id) && !direct.some((d) => d.id === id)) return;
        keep!.add(id);
        (map.get(id) ?? []).forEach((x) => walk(x, map));
      };
      direct.forEach((d) => {
        walk(d.id, up);
        walk(d.id, down);
      });
    }
    // layered layout: each tier ordered by the average position of its parents, rows centred
    const GAP_X = 230;
    const GAP_Y = 190;
    const xOf = new Map<string, number>();
    const levels = [...new Set(data.nodes.map((n) => n.level))].sort((a, b) => a - b);
    const widest = Math.max(...levels.map((l) => data.nodes.filter((n) => n.level === l).length));
    const placed: Node<KpiNodeData>[] = [];
    levels.forEach((lvl) => {
      const row = data.nodes
        .filter((n) => n.level === lvl)
        .map((n) => {
          const ps = (up.get(n.id) ?? []).map((p) => xOf.get(p)).filter((x): x is number => x !== undefined);
          return { n, key: ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : Number.MAX_SAFE_INTEGER };
        })
        .sort((a, b) => a.key - b.key || a.n.id.localeCompare(b.n.id));
      const offset = ((widest - row.length) * GAP_X) / 2;
      row.forEach(({ n }, i) => {
        const x = offset + i * GAP_X;
        xOf.set(n.id, x);
        placed.push({
          id: n.id,
          type: 'kpi',
          position: { x, y: lvl * GAP_Y },
          data: { ...n, dim: !!keep && !keep.has(n.id) },
        });
      });
    });
    const nodes = placed;
    const edges: Edge[] = data.edges.map((e) => ({
      id: `${e.source}-${e.target}-${e.relation}`,
      source: e.source,
      target: e.target,
      label: e.relation === 'rolls_up' ? `${e.weight}%` : 'driver',
      animated: e.relation === 'explains',
      style: {
        strokeDasharray: e.relation === 'explains' ? '5 4' : undefined,
        opacity: keep && !(keep.has(e.source) && keep.has(e.target)) ? 0.15 : 1,
      },
      markerEnd: { type: MarkerType.ArrowClosed },
    }));
    return { nodes, edges, shown: keep ? keep.size : data.nodes.length };
  }, [cascade.data, q, filters, lineage]);

  if (cascade.isLoading) return <Spinner />;
  if (cascade.error) return <ErrorBox error={cascade.error} />;
  const kpi = kpis.data?.find((k) => k.kpi_id === open);
  const setF = (k: keyof typeof filters) => (v: string) => setFilters({ ...filters, [k]: v });
  const opts = (lvl: number) => byLevel(lvl).map((n) => ({ value: n.code, label: `${n.code} · ${n.name}` }));

  return (
    <>
      <PageHeader
        title="KPI hierarchy & cascade"
        subtitle="How KPIs cascade from strategic to operational indicators — definitions and relationships only (no values). Solid arrows roll up with a weight; dashed arrows are explanatory drivers. The enterprise outcome (ENT-KPI-01) is kept off the network."
      />
      <div ref={fs.ref} className="fs-panel">
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="KPI name or id" />
          <Select label="Domain" value={filters.domain} onChange={setF('domain')} options={opts(0)} />
          <Select label="Function" value={filters.function} onChange={setF('function')} options={opts(1)} />
          <Select label="Sub-function" value={filters.sub} onChange={setF('sub')} options={opts(2)} />
          <Select label="Process" value={filters.process} onChange={setF('process')} options={opts(3)} />
          <FullscreenButton on={fs.on} toggle={fs.toggle} />
          <span className="muted small">{shown} KPIs in view</span>
        </div>
        <div className="legend" style={{ marginBottom: 8 }}>
          {TIERS.map((t, i) => (
            <span key={t}>
              <i style={{ background: LEVEL_COLOR[i] }} />L{i} {t}
            </span>
          ))}
        </div>
        <div className="flow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.2}
            nodesConnectable={false}
            onNodeClick={(_, n) => setOpen(n.id)}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        {open && kpi && (
          <Modal title={`${kpi.kpi_id} · ${kpi.name}`} onClose={() => setOpen(null)} wide>
            <p className="small muted">
              {kpi.tier} · {kpi.node_code} {kpi.node_name} · {kpi.calc_type}
            </p>
            <KpiDetail kpi={kpi} metadataOnly />
          </Modal>
        )}
      </div>
    </>
  );
}
