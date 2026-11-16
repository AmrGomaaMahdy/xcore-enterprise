import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Image as ImageIcon,
  Maximize,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Save,
  ScanSearch,
} from 'lucide-react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

import { ErrorBox, Modal, useFullscreen } from '@/components/ui';

interface Canvas {
  zoom: (v?: string | number, center?: 'auto') => number;
  resized: () => void;
  addMarker: (id: string, cls: string) => void;
  removeMarker: (id: string, cls: string) => void;
}
interface Registry {
  getAll: () => { id: string; type: string; businessObject?: { $type?: string } }[];
}
interface EventBus {
  on: (event: string, cb: () => void) => void;
}
type Instance = {
  importXML: (xml: string) => Promise<unknown>;
  saveXML: (o: { format: boolean }) => Promise<{ xml?: string }>;
  saveSVG: () => Promise<{ svg: string }>;
  destroy: () => void;
  get: (name: string) => unknown;
};

export type DiffMark = 'added' | 'changed' | 'removed';
type ColorMode = 'type' | 'none';

const TASK_KIND: Record<string, string> = {
  'bpmn:UserTask': 'user',
  'bpmn:ServiceTask': 'service',
  'bpmn:ScriptTask': 'service',
  'bpmn:BusinessRuleTask': 'service',
  'bpmn:ManualTask': 'manual',
  'bpmn:Task': 'task',
  'bpmn:SendTask': 'task',
  'bpmn:ReceiveTask': 'task',
  'bpmn:SubProcess': 'sub',
  'bpmn:CallActivity': 'sub',
  'bpmn:StartEvent': 'start',
  'bpmn:EndEvent': 'end',
  'bpmn:ExclusiveGateway': 'gateway',
  'bpmn:ParallelGateway': 'gateway',
  'bpmn:InclusiveGateway': 'gateway',
};
export const LEGEND = [
  { cls: 'user', label: 'User task' },
  { cls: 'service', label: 'Service / system task' },
  { cls: 'manual', label: 'Manual task' },
  { cls: 'sub', label: 'Sub-process' },
  { cls: 'gateway', label: 'Gateway' },
];

function download(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function svgToPng(svg: string): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not render the diagram as an image.'));
    img.src = url;
  });
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
  );
}

interface Props {
  xml: string;
  editable?: boolean;
  onSave?: (xml: string) => void;
  saving?: boolean;
  /** base file name for exports, e.g. 15-030_To-Be_v3.0 */
  fileName?: string;
  /** colour activities by diff state (compare view) */
  marks?: Record<string, DiffMark>;
  compact?: boolean;
  height?: number;
}

/** BPMN 2.0 viewer / modeler with zoom, colour coding, export (BPMN · XML · SVG · PNG) and XML source view. */
export function BpmnPanel({
  xml,
  editable = false,
  onSave,
  saving,
  fileName = 'process',
  marks,
  compact = false,
  height,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Instance | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<ColorMode>('type');
  const [ready, setReady] = useState(0);
  const [xmlView, setXmlView] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const fs = useFullscreen<HTMLDivElement>();
  const userZoomed = useRef(false);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const c = instance.current?.get('canvas') as Canvas | undefined;
        if (!c) return;
        c.resized();
        if (!userZoomed.current) c.zoom('fit-viewport', 'auto');
      });
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  const canvas = () => instance.current?.get('canvas') as Canvas | undefined;

  useEffect(() => {
    let disposed = false;
    setReady(0);
    (async () => {
      const mod = editable ? await import('bpmn-js/lib/Modeler') : await import('bpmn-js/lib/NavigatedViewer');
      if (disposed || !host.current) return;
      const Ctor = mod.default as unknown as new (o: { container: HTMLElement }) => Instance;
      const bpmn = new Ctor({ container: host.current });
      instance.current = bpmn;
      try {
        await bpmn.importXML(xml);
        const c = bpmn.get('canvas') as Canvas;
        c.resized();
        c.zoom('fit-viewport', 'auto');
        setZoom(c.zoom());
        // keep the diagram fitted while the panel settles (fonts, toolbars, full screen)
        userZoomed.current = false;
        (bpmn.get('eventBus') as EventBus).on('canvas.viewbox.changed', () =>
          setZoom((bpmn.get('canvas') as Canvas).zoom()),
        );
        setError(null);
        setReady((r) => r + 1);
      } catch (e) {
        setError(e);
      }
    })();
    return () => {
      disposed = true;
      instance.current?.destroy();
      instance.current = null;
    };
  }, [xml, editable]);

  // colour coding by element type and diff markers
  useEffect(() => {
    const bpmn = instance.current;
    if (!bpmn || !ready) return;
    const c = bpmn.get('canvas') as Canvas;
    const all = (bpmn.get('elementRegistry') as Registry).getAll();
    all.forEach((el) => {
      const kind = TASK_KIND[el.businessObject?.$type ?? el.type];
      if (!kind || el.type === 'label') return;
      ['user', 'service', 'manual', 'task', 'sub', 'start', 'end', 'gateway'].forEach((k) =>
        c.removeMarker(el.id, `xc-${k}`),
      );
      ['added', 'changed', 'removed'].forEach((k) => c.removeMarker(el.id, `xc-diff-${k}`));
      if (mode === 'type' && !marks) c.addMarker(el.id, `xc-${kind}`);
      const mark = marks?.[el.id];
      if (mark) c.addMarker(el.id, `xc-diff-${mark}`);
    });
  }, [mode, marks, ready]);

  const zoomBy = (f: number) => {
    userZoomed.current = true;
    const c = canvas();
    if (c) c.zoom(Math.min(4, Math.max(0.2, c.zoom() * f)), 'auto');
  };
  const fit = () => {
    userZoomed.current = false;
    canvas()?.zoom('fit-viewport', 'auto');
  };

  const currentXml = useCallback(async () => (await instance.current?.saveXML({ format: true }))?.xml ?? xml, [xml]);

  const exportAs = async (kind: 'bpmn' | 'xml' | 'svg' | 'png') => {
    setMenu(false);
    try {
      if (kind === 'bpmn' || kind === 'xml') {
        download(`${fileName}.${kind}`, new Blob([await currentXml()], { type: 'application/xml' }));
        return;
      }
      const { svg } = await instance.current!.saveSVG();
      if (kind === 'svg') download(`${fileName}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
      else download(`${fileName}.png`, await svgToPng(svg));
    } catch (e) {
      setError(e);
    }
  };

  const save = async () => {
    const res = await instance.current?.saveXML({ format: true });
    if (res?.xml) onSave?.(res.xml);
  };

  return (
    <div ref={fs.ref} className={`fs-panel bpmn-panel ${compact ? 'bpmn-panel--compact' : ''}`}>
      <div className="bpmn-toolbar">
        <div className="btn-group" role="group" aria-label="Zoom">
          <button
            className="btn btn--ghost btn--icon"
            onClick={() => zoomBy(1 / 1.2)}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={15} />
          </button>
          <button
            className="btn btn--ghost btn--zoom"
            onClick={() => {
              userZoomed.current = true;
              canvas()?.zoom(1, 'auto');
            }}
            title="Reset to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn--ghost btn--icon" onClick={() => zoomBy(1.2)} title="Zoom in" aria-label="Zoom in">
            <Plus size={15} />
          </button>
          <button className="btn btn--ghost btn--icon" onClick={fit} title="Fit to screen" aria-label="Fit to screen">
            <ScanSearch size={15} />
          </button>
        </div>
        {!compact && !marks && (
          <div className="btn-group" role="group" aria-label="Colouring">
            <button
              className={`btn btn--ghost btn--sm ${mode === 'type' ? 'is-on' : ''}`}
              onClick={() => setMode('type')}
            >
              Colour by type
            </button>
            <button
              className={`btn btn--ghost btn--sm ${mode === 'none' ? 'is-on' : ''}`}
              onClick={() => setMode('none')}
            >
              Classic
            </button>
          </div>
        )}
        <span className="toolbar__spacer" />
        {!compact && (
          <>
            <button className="btn btn--ghost btn--sm" onClick={async () => setXmlView(await currentXml())}>
              <Code2 size={14} /> XML
            </button>
            <div className="dropdown">
              <button className="btn btn--ghost btn--sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
                <Download size={14} /> Export
              </button>
              {menu && (
                <div className="dropdown__menu" role="menu" onMouseLeave={() => setMenu(false)}>
                  <button role="menuitem" onClick={() => exportAs('bpmn')}>
                    <FileCode2 size={14} /> BPMN 2.0 (.bpmn)
                  </button>
                  <button role="menuitem" onClick={() => exportAs('xml')}>
                    <Code2 size={14} /> XML (.xml)
                  </button>
                  <button role="menuitem" onClick={() => exportAs('svg')}>
                    <ImageIcon size={14} /> Vector image (.svg)
                  </button>
                  <button role="menuitem" onClick={() => exportAs('png')}>
                    <ImageIcon size={14} /> Image (.png)
                  </button>
                </div>
              )}
            </div>
            <button
              className="btn btn--ghost btn--sm btn--icon"
              onClick={fs.toggle}
              title={fs.on ? 'Exit full screen' : 'Full screen'}
              aria-label="Full screen"
            >
              {fs.on ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </>
        )}
        {editable && (
          <button className="btn btn--sm" onClick={save} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save model'}
          </button>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="bpmn-stage">
        <div
          ref={host}
          className={`bpmn-canvas ${editable ? 'bpmn-canvas--edit' : ''}`}
          style={height ? { height } : undefined}
        />
        {editable && <span className="bpmn-stage__badge">Editing draft</span>}
        <button className="bpmn-stage__fit" onClick={fit} title="Fit to screen">
          <Maximize size={14} />
        </button>
      </div>
      {!compact && !marks && mode === 'type' && (
        <div className="legend bpmn-legend">
          {LEGEND.map((l) => (
            <span key={l.cls}>
              <i className={`swatch swatch--${l.cls}`} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {xmlView !== null && <XmlModal xml={xmlView} fileName={fileName} onClose={() => setXmlView(null)} />}
    </div>
  );
}

function XmlModal({ xml, fileName, onClose }: { xml: string; fileName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const lines = xml.split('\n');
  return (
    <Modal
      wide
      title={
        <span className="modal-title-icon">
          <Code2 size={18} /> BPMN 2.0 XML · {fileName}
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <span className="muted small" style={{ marginRight: 'auto' }}>
            {lines.length} lines · {(new Blob([xml]).size / 1024).toFixed(1)} KB
          </span>
          <button
            className="btn btn--ghost"
            onClick={async () => {
              await navigator.clipboard.writeText(xml);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            className="btn"
            onClick={() => download(`${fileName}.bpmn`, new Blob([xml], { type: 'application/xml' }))}
          >
            <Download size={14} /> Download
          </button>
        </>
      }
    >
      <pre className="code-view">
        {lines.map((l, i) => (
          <div key={i} className="code-view__line">
            <span className="code-view__no">{i + 1}</span>
            <code>{l}</code>
          </div>
        ))}
      </pre>
    </Modal>
  );
}
