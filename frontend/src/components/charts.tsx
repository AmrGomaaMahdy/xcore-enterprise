/** Small dependency-free SVG charts that follow the theme tokens. */
import type { ReactNode } from 'react';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Donut chart with a centre label and a legend. */
export function Donut({
  data,
  size = 150,
  thickness = 20,
  center,
  sub,
}: {
  data: Slice[];
  size?: number;
  thickness?: number;
  center?: ReactNode;
  sub?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={data.map((d) => `${d.label} ${d.value}`).join(', ')}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {total > 0 &&
          data.map((d) => {
            const len = (d.value / total) * c;
            const el = (
              <circle
                key={d.label}
                className="donut__seg"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              >
                <title>{`${d.label}: ${d.value}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        <text x="50%" y="48%" textAnchor="middle" className="donut__value">
          {center ?? total}
        </text>
        {sub && (
          <text x="50%" y="62%" textAnchor="middle" className="donut__sub">
            {sub}
          </text>
        )}
      </svg>
      <ul className="legend legend--col">
        {data.map((d) => (
          <li key={d.label}>
            <i style={{ background: d.color }} />
            {d.label} <strong>{d.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Radial gauge 0–100 with a colour band. */
export function Gauge({ value, size = 180, label }: { value: number; size?: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const stroke = 16;
  const r = (size - stroke) / 2;
  const half = Math.PI * r;
  const color = v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)';
  return (
    <svg
      width={size}
      height={size / 2 + 34}
      viewBox={`0 0 ${size} ${size / 2 + 34}`}
      className="gauge"
      role="img"
      aria-label={`${label ?? 'Score'} ${v}%`}
    >
      <path
        d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        fill="none"
        stroke="var(--surface-2)"
        strokeWidth={stroke}
        strokeLinecap="round"
      />
      <path
        className="gauge__arc"
        d={`M ${stroke / 2} ${size / 2} A ${r} ${r} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * half} ${half}`}
      />
      <text x="50%" y={size / 2 - 4} textAnchor="middle" className="gauge__value">
        {Math.round(v)}%
      </text>
      {label && (
        <text x="50%" y={size / 2 + 22} textAnchor="middle" className="gauge__label">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Small circular progress ring (for cards). */
export function Ring({ value, size = 54, color }: { value: number; size?: number; color?: string }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const col = color ?? (v >= 80 ? 'var(--ok)' : v >= 50 ? 'var(--warn)' : 'var(--bad)');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={`${v}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={col}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(v / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="ring__arc"
      />
      <text x="50%" y="56%" textAnchor="middle" className="ring__value">
        {Math.round(v)}
      </text>
    </svg>
  );
}

/** Horizontal bars with labels. */
export function HBars({ data, max }: { data: Slice[]; max?: number }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="hbars">
      {data.map((d) => (
        <div key={d.label} className="hbars__row">
          <span className="hbars__label">{d.label}</span>
          <div className="hbars__track">
            <span style={{ width: `${(d.value / m) * 100}%`, background: d.color }} />
          </div>
          <span className="hbars__value">{d.value}</span>
        </div>
      ))}
    </div>
  );
}
