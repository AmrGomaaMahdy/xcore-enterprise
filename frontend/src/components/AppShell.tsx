import { useState } from 'react';
import {
  Boxes,
  CheckSquare,
  ClipboardList,
  GitBranch,
  Grid3x3,
  History,
  LayoutDashboard,
  Library,
  LogOut,
  Network,
  PanelLeft,
  Radar,
  Target,
  Users,
} from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';

import { useApprovals } from '@/api/hooks';
import { useAuth } from '@/auth/AuthContext';
import { THEMES, useTheme, type ThemeId } from '@/theme/ThemeContext';

const NAV = [
  {
    group: 'Process Hub',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/library', label: 'Business Process Library', icon: Library },
      { to: '/activity-map', label: 'Activity automation map', icon: Grid3x3 },
      { to: '/job-architecture', label: 'Job architecture', icon: Users },
    ],
  },
  {
    group: 'KPI repositories',
    items: [
      { to: '/kpis', label: 'Enterprise KPI Library', icon: Target, end: true },
      { to: '/kpis/alignment', label: 'KPI Alignment Matrix', icon: GitBranch },
      { to: '/kpis/cascade', label: 'KPI hierarchy & cascade', icon: Network },
    ],
  },
  { group: 'Services', items: [{ to: '/catalog', label: 'Service Catalog', icon: Boxes }] },
  {
    group: 'Governance',
    items: [
      { to: '/impact', label: 'Impact analysis', icon: Radar },
      { to: '/approvals', label: 'Approvals', icon: CheckSquare, badge: true },
      { to: '/audit', label: 'Audit trail', icon: History },
    ],
  },
];

export function AppShell() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const pending = useApprovals({ status: 'pending' }).data?.length ?? 0;
  const initials = (user?.display_name || user?.username || '?')
    .split(/[\s.]+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={collapsed ? 'shell shell--collapsed' : 'shell'}>
      <header className="topbar">
        <button className="icon-btn" onClick={() => setCollapsed((c) => !c)} aria-label="Toggle menu">
          <PanelLeft size={18} />
        </button>
        <Link to="/" className="brand">
          <img className="brand__mark" src="/xcore-mark.svg" alt="" />
          <div>
            <div className="brand__name">X-Core</div>
            <div className="brand__tag">The Business Excellence Platform</div>
          </div>
        </Link>
        <span className="brand__divider" />
        <img className="brand__logo" src="/al-ayuni-logo.png" alt="Al-Ayuni" />
        <span className="topbar__module">Process Hub</span>
        <span className="topbar__spacer" />
        <label className="field field--inline small">
          <span>Theme</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)} aria-label="Theme">
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <a className="btn btn--ghost btn--sm" href="/api/v1/docs/" target="_blank" rel="noreferrer">
          <ClipboardList size={14} /> API docs
        </a>
        <div className="topbar__user">
          <div className="avatar" aria-hidden>
            {initials}
          </div>
          <div className="small">
            <div>
              <strong>{user?.display_name || user?.username}</strong>
            </div>
            <div className="muted">{user?.role}</div>
          </div>
          <button className="icon-btn" onClick={() => void signOut()} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <nav className="sidebar" aria-label="Main">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="sidebar__group">{g.group}</div>
            {g.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item ? item.end : false}
                className="nav__item"
                title={item.label}
              >
                <item.icon size={17} />
                <span className="nav__label">{item.label}</span>
                {'badge' in item && item.badge && pending > 0 && <span className="nav__badge">{pending}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
