import { useEffect, useRef, useState } from 'react';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';

import { ErrorBox, FullscreenButton, useFullscreen } from '@/components/ui';

type Instance = {
  importXML: (xml: string) => Promise<unknown>;
  saveXML: (o: { format: boolean }) => Promise<{ xml?: string }>;
  destroy: () => void;
  get: (name: string) => { zoom: (v: string | number) => void };
};

/** BPMN 2.0 viewer (read-only) or modeler (Draft versions). XML is rendered by bpmn-js as SVG — never as HTML. */
export function BpmnPanel({
  xml,
  editable,
  onSave,
  saving,
}: {
  xml: string;
  editable: boolean;
  onSave?: (xml: string) => void;
  saving?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Instance | null>(null);
  const [error, setError] = useState<unknown>(null);
  const fs = useFullscreen<HTMLDivElement>();

  useEffect(() => {
    let disposed = false;
    (async () => {
      const mod = editable ? await import('bpmn-js/lib/Modeler') : await import('bpmn-js/lib/NavigatedViewer');
      if (disposed || !host.current) return;
      const Ctor = mod.default as unknown as new (o: { container: HTMLElement }) => Instance;
      const bpmn = new Ctor({ container: host.current });
      instance.current = bpmn;
      try {
        await bpmn.importXML(xml);
        bpmn.get('canvas').zoom('fit-viewport');
        setError(null);
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

  const save = async () => {
    const res = await instance.current?.saveXML({ format: true });
    if (res?.xml) onSave?.(res.xml);
  };

  return (
    <div ref={fs.ref} className="fs-panel">
      <div className="toolbar">
        <button className="btn btn--ghost btn--sm" onClick={() => instance.current?.get('canvas').zoom('fit-viewport')}>
          Fit to screen
        </button>
        <FullscreenButton on={fs.on} toggle={fs.toggle} />
        {editable && (
          <button className="btn btn--sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save model'}
          </button>
        )}
        <span className="muted small">
          {editable
            ? 'Modeler — Draft version: edits are saved to this draft only.'
            : 'Viewer — approved or in-review versions are read-only.'}
        </span>
      </div>
      <ErrorBox error={error} />
      <div ref={host} className="bpmn-canvas" />
    </div>
  );
}
