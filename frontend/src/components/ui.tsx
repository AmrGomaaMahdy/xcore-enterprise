import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Loader2, Maximize2, Minimize2, Search, X } from 'lucide-react';

import { errorText } from '@/api/client';

export function Spinner({ label = 'Loading…', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={full ? 'spinner spinner--full' : 'spinner'} role="status">
      <Loader2 className="spin" size={18} /> <span>{label}</span>
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="alert alert--error" role="alert">
      <AlertTriangle size={16} /> {errorText(error)}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

const STATUS_TONE: Record<string, string> = {
  Approved: 'ok',
  Active: 'ok',
  approved: 'ok',
  Mitigated: 'ok',
  Draft: 'muted',
  'In review': 'warn',
  pending: 'warn',
  Open: 'warn',
  Retired: 'off',
  Expired: 'off',
  withdrawn: 'off',
  rejected: 'bad',
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const t = tone ?? (typeof children === 'string' ? STATUS_TONE[children] : undefined) ?? 'info';
  return <span className={`badge badge--${t}`}>{children}</span>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; count?: number; icon?: ReactNode }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={value === t.id ? 'tab tab--active' : 'tab'}
          onClick={() => onChange(t.id)}
        >
          {t.icon}
          {t.label}
          {t.count !== undefined && <span className="tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
  footer,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal--wide' : 'modal'} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <div className="modal__head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search">
      <Search size={15} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
      {value && (
        <button className="icon-btn icon-btn--sm" onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function Select({
  label,
  value,
  onChange,
  options,
  allLabel = 'All',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string | null;
}) {
  return (
    <label className="field field--inline">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k} className="kv__row">
          <dt>{k}</dt>
          <dd>{v === '' || v === null || v === undefined ? <span className="muted">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Full-screen toggle for any panel (KPI cascade, BPMN model, maps). */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void ref.current?.requestFullscreen?.();
  }, []);
  return { ref, on, toggle };
}

export function FullscreenButton({ on, toggle }: { on: boolean; toggle: () => void }) {
  return (
    <button className="btn btn--ghost" onClick={toggle} title={on ? 'Exit full screen' : 'Full screen'}>
      {on ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {on ? 'Exit full screen' : 'Full screen'}
    </button>
  );
}

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—';
export const fmtDateTime = (s?: string | null) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
