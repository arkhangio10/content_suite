import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  IconActivity,
  IconBell,
  IconChevronDown,
  IconLayoutDashboard,
  IconLogout,
  IconSearch,
  IconShield,
  IconSpark,
  IconSparkles,
  IconWand,
} from '@/components/icons';
import { LogoBadge, V2BrandMark, cn } from '@/components/ui';
import { V2_BRANDS, V2_ROLE, V2_SUGGESTIONS } from '@/data';

const NAV_ITEMS = [
  { id: 'home',          path: '/',              label: 'Inicio',                 icon: IconLayoutDashboard, roles: ['creator', 'approver_a', 'approver_b'] },
  { id: 'brand-dna',     path: '/brand-dna',     label: 'Brand DNA Architect',    icon: IconSparkles,        roles: ['creator', 'approver_a', 'approver_b'] },
  { id: 'creative',      path: '/creative',      label: 'Creative Engine',        icon: IconWand,            roles: ['creator', 'approver_a', 'approver_b'] },
  { id: 'governance',    path: '/governance',    label: 'Gobernanza',             icon: IconShield,          roles: ['approver_a', 'approver_b'] },
  { id: 'observability', path: '/observability', label: 'Observabilidad',         icon: IconActivity,        roles: ['creator', 'approver_a', 'approver_b'] },
];

function Sidebar({ collapsed, onToggle }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <aside className={cn('relative shrink-0 border-r border-hairline bg-white transition-all duration-300', collapsed ? 'w-[68px]' : 'w-[244px]')}>
      <div className="h-16 flex items-center px-5 border-b border-hairline">
        <button onClick={onToggle} className="flex items-center gap-3 group">
          <LogoBadge size={36} />
          {!collapsed && (
            <div className="text-left">
              <p className="text-[13px] font-bold tracking-tight leading-none" style={{ color: '#1A1A1A' }}>Content Suite</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mt-1 leading-none" style={{ color: '#E8001D' }}>Plataforma de marca</p>
            </div>
          )}
        </button>
      </div>
      <nav className="px-3 py-4 space-y-0.5">
        {NAV_ITEMS.filter((i) => i.roles.includes(user.role)).map((i) => {
          const isActive = location.pathname === i.path || (i.path !== '/' && location.pathname.startsWith(i.path));
          const Icon = i.icon;
          return (
            <button
              key={i.id}
              onClick={() => navigate(i.path)}
              className={cn(
                'group w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150 relative',
                isActive ? 'bg-paper text-ink' : 'text-inksoft hover:bg-paper/60 hover:text-ink',
              )}
            >
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent"></span>}
              <span className={cn('shrink-0 transition-transform', isActive && 'text-accent')}><Icon size={18} /></span>
              {!collapsed && <span className="flex-1 text-left">{i.label}</span>}
            </button>
          );
        })}
      </nav>
      {!collapsed && (
        <div className="absolute left-3 right-3 bottom-4 rounded-2xl border border-hairline paper-warm p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">Stack</p>
          <p className="font-serif italic text-lg text-ink leading-tight mt-1.5">
            FastAPI · pgvector
          </p>
          <p className="text-[11px] text-inksoft mt-1 leading-relaxed">
            Claude Opus + Sonnet + Haiku · Langfuse v4 · Supabase Auth + RLS.
          </p>
        </div>
      )}
    </aside>
  );
}

function Topbar({ onOpenPalette }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  if (!user) return null;

  const breadcrumb = NAV_ITEMS.find((i) => i.path === location.pathname)?.label ??
    NAV_ITEMS.find((i) => i.path !== '/' && location.pathname.startsWith(i.path))?.label ??
    'Inicio';
  const rm = V2_ROLE[user.role];

  return (
    <header className="h-16 shrink-0 border-b border-hairline bg-white sticky top-0 z-30">
      <div className="h-full px-7 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0 text-[13px]">
          <span className="font-semibold text-ink">{breadcrumb}</span>
        </div>
        <div className="flex-1 max-w-md hidden lg:block">
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center gap-2.5 rounded-full border border-hairline bg-paper hover:bg-paperwarm/60 transition-colors px-4 py-1.5 text-sm text-inkmute"
          >
            <IconSearch size={15} />
            <span className="flex-1 text-left">Buscar marcas, manuales, contenido…</span>
            <span className="mono text-[10px] text-inkmute bg-white border border-hairline rounded px-1.5 py-0.5">⌘K</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="relative h-9 w-9 rounded-full hover:bg-paper grid place-items-center text-inksoft">
            <IconBell size={16} />
            <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-bad animate-pulse-soft"></span>
          </button>
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1', rm.soft)}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: rm.dot }}></span>
            {rm.label}
          </span>
          <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-paper transition-colors"
            >
              <V2BrandMark brand={{ hue: ['#1A1A1A', '#FFFFFF'], glyph: user.initials.slice(0, 1) }} size={28} />
              <span className="text-sm font-medium text-ink hidden md:inline">{user.full_name.split(' ')[0]}</span>
              <IconChevronDown size={13} className="text-inkmute" />
            </button>
            {menu && (
              <div className="absolute right-0 top-full mt-1 w-72 rounded-2xl border border-hairline bg-white shadow-xl shadow-black/5 p-1.5 animate-fade-up z-50">
                <div className="px-3 py-3 border-b border-hairline">
                  <p className="text-sm font-semibold text-ink">{user.full_name}</p>
                  <p className="text-xs text-inkmute">{user.email}</p>
                </div>
                <div className="px-3 py-2 border-b border-hairline">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">Rol activo</p>
                  <p className="text-sm text-ink mt-0.5">{rm.label}</p>
                </div>
                <button
                  onClick={async () => {
                    setMenu(false);
                    await signOut();
                  }}
                  className="w-full flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-inksoft hover:bg-paper mt-1"
                >
                  <IconLogout size={14} /> Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function CommandPalette({ open, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  const items = [
    ...NAV_ITEMS.filter((i) => !user || i.roles.includes(user.role)).map((i) => ({
      kind: 'pagina',
      label: i.label,
      path: i.path,
      icon: <i.icon size={14} />,
    })),
    ...V2_BRANDS.map((b) => ({
      kind: 'marca',
      label: b.id,
      path: '/brand-dna',
      meta: b.category,
      icon: <V2BrandMark brand={b} size={20} />,
    })),
    ...V2_SUGGESTIONS.map((s) => ({
      kind: 'idea',
      label: s,
      path: '/brand-dna',
      icon: <IconSpark size={14} />,
    })),
  ];
  const filtered = items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-[14vh] bg-black/30 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div className="w-full max-w-xl rounded-2xl border border-hairline bg-white shadow-2xl overflow-hidden animate-slide-up-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
          <IconSearch size={16} className="text-inkmute" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pregunta o busca cualquier cosa…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <span className="mono text-[10px] text-inkmute">esc</span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && <p className="text-sm text-inkmute text-center py-12">Sin resultados.</p>}
          {filtered.slice(0, 12).map((it, i) => (
            <button
              key={i}
              onClick={() => {
                navigate(it.path);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-2 hover:bg-paper transition-colors text-left"
            >
              <span className="text-inksoft">{it.icon}</span>
              <span className="flex-1 text-sm text-ink">{it.label}</span>
              <span className="mono text-[10px] text-inkmute uppercase">{it.kind}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-hairline px-4 py-2 text-[11px] text-inkmute flex items-center justify-between">
          <span>{filtered.length} resultados</span>
          <span><span className="mono">↑↓</span> navegar · <span className="mono">↵</span> abrir</span>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [location.pathname]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="h-screen w-screen flex bg-transparent overflow-hidden relative" style={{ zIndex: 1 }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar onOpenPalette={() => setPaletteOpen(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div key={location.pathname} className="animate-fade-up">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={closePalette} />
    </div>
  );
}
