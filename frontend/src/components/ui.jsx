import React, { useEffect, useRef, useState } from 'react';
import { IconChevronDown } from './icons';
import { V2_STATUS, V2_BRANDS } from '@/data';

/** className concat helper */
export const cn = (...a) => a.filter(Boolean).join(' ');
// Legacy alias
export const cn2 = cn;

// ─────────────────────────────────────────────────────────────
// Status pill
// ─────────────────────────────────────────────────────────────

export function V2Pill({ status, className }) {
  const meta = V2_STATUS[status] || { label: status, cls: 'bg-hairline text-inksoft' };
  const live = ['generando', 'evaluando', 'reparando', 'pendiente_aprobacion', 'running', 'submitted'].includes(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium', meta.cls, className)}>
      {live && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-75 animate-ping"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
        </span>
      )}
      {meta.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────────────────────

export function V2Button({ as = 'button', variant = 'primary', size = 'md', className, children, ...rest }) {
  const Comp = as;
  const v = {
    primary:   'bg-ink text-paper hover:bg-black active:bg-black shadow-sm',
    accent:    'bg-accent text-white hover:bg-[#b8001a] shadow-sm',
    secondary: 'border border-hairlinestrong text-inksoft bg-white hover:bg-paper',
    ghost:     'text-inksoft hover:bg-hairline/40',
    danger:    'bg-bad text-white hover:bg-[#8a2616]',
    success:   'bg-good text-white hover:bg-[#235a2e]',
  }[variant];
  const s = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }[size];
  return (
    <Comp className={cn('inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none', v, s, className)} {...rest}>
      {children}
    </Comp>
  );
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

export function V2Card({ className, children, padded = true, tone, ...rest }) {
  const toneCls = tone === 'warm' ? 'bg-paperwarm' : 'bg-white';
  return (
    <div className={cn('rounded-2xl border border-hairline', toneCls, padded && 'p-6', className)} {...rest}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Form primitives
// ─────────────────────────────────────────────────────────────

export function V2Label({ children, className }) {
  return <label className={cn('text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute block', className)}>{children}</label>;
}

export function V2Input({ className, ...rest }) {
  return <input className={cn('w-full rounded-lg border border-hairlinestrong bg-white px-3 py-2 text-sm text-ink placeholder:text-inkmute transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent', className)} {...rest} />;
}

export function V2Textarea({ className, rows = 3, ...rest }) {
  return <textarea rows={rows} className={cn('w-full rounded-lg border border-hairlinestrong bg-white px-3 py-2 text-sm text-ink placeholder:text-inkmute transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent resize-y', className)} {...rest} />;
}

export function V2Select({ className, children, ...rest }) {
  return (
    <div className="relative">
      <select className={cn('w-full appearance-none rounded-lg border border-hairlinestrong bg-white px-3 py-2 pr-9 text-sm text-ink transition-shadow focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent', className)} {...rest}>
        {children}
      </select>
      <IconChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-inkmute" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Tooltip + Skeleton + BrandMark
// ─────────────────────────────────────────────────────────────

export function V2Tooltip({ children, label, side = 'top' }) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className={cn(
        'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100',
        side === 'top' ? '-top-9' : 'top-full mt-2')}>{label}</span>
    </span>
  );
}

export function V2Skel({ className }) {
  return <div className={cn('skeleton rounded-md', className)}></div>;
}

export function V2BrandMark({ brand, size = 40, className }) {
  const b = (typeof brand === 'string' ? V2_BRANDS.find((x) => x.id === brand) : brand) || { hue: ['#E8001D', '#FFFFFF'], glyph: '?' };
  return (
    <span
      className={cn('inline-flex items-center justify-center rounded-xl shrink-0 font-serif italic font-normal leading-none select-none', className)}
      style={{ width: size, height: size, background: b.hue[0], color: b.hue[1], fontSize: size * 0.5 }}
    >
      {b.glyph}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// Reveal hook + Counter + WordReveal + Typewriter
// ─────────────────────────────────────────────────────────────

export function useV2Reveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('in');
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function V2Counter({ value, decimals = 0, duration = 900, prefix = '', suffix = '' }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    let t0 = null;
    const step = (t) => {
      if (t0 == null) t0 = t;
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return (
    <span className="counter">
      {prefix}
      {v.toLocaleString('es-PE', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export function V2WordReveal({ text, delay = 0, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const wrap = ref.current;
      if (!wrap) return;
      [...wrap.querySelectorAll('.word')].forEach((w, i) => {
        setTimeout(() => w.classList.add('in'), i * 70);
      });
    }, delay);
    return () => clearTimeout(t);
  }, [text, delay]);
  return (
    <span ref={ref} className={className}>
      {text.split(' ').map((w, i, arr) => (
        <span key={i} className="word-wrap">
          <span className="word">
            {w}
            {i < arr.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

export function V2Typewriter({ text, speed = 14, onDone, className }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (n >= text.length) {
      onDone?.();
      return;
    }
    const id = setTimeout(() => setN(n + 1), speed);
    return () => clearTimeout(id);
  }, [n, text, speed]);
  return <span className={cn('caret', className)}>{text.slice(0, n)}</span>;
}

// ─────────────────────────────────────────────────────────────
// Timeline + Dial
// ─────────────────────────────────────────────────────────────

export function V2TimelineItem({ ts, actor, event, detail, role }) {
  const dot =
    role === 'system'
      ? 'bg-inkmute'
      : role === 'approver_a'
        ? 'bg-violet'
        : role === 'approver_b'
          ? 'bg-good'
          : 'bg-accent';
  return (
    <li className="relative pl-5">
      <span className={cn('absolute left-0 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-white', dot)}></span>
      <p className="text-xs">
        <span className="font-semibold text-ink">{event}</span>
        <span className="text-inkmute"> · {actor}</span>
      </p>
      <p className="text-[11px] text-inkmute mt-0.5">
        {new Date(ts).toLocaleString('es-PE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
        {detail && <span> · {detail}</span>}
      </p>
    </li>
  );
}

export function V2Dial({ value, size = 56, label }) {
  const r = (size - 8) / 2;
  const C = 2 * Math.PI * r;
  const off = C * (1 - value);
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#E8E8E8" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#E8001D"
          strokeWidth="4"
          fill="none"
          strokeDasharray={C}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div>
        <p className="text-lg font-semibold text-ink counter">{Math.round(value * 100)}%</p>
        <p className="text-[11px] text-inkmute">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LogoBadge — used by Shell + Login
// ─────────────────────────────────────────────────────────────

export function LogoBadge({ size = 40 }) {
  const fs = size * 0.4;
  const r = size * 0.22;
  return (
    <span
      className="inline-flex items-center justify-center font-bold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: '#E8001D',
        color: '#FFFFFF',
        fontSize: fs,
        letterSpacing: '-0.04em',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      cs
    </span>
  );
}

// Re-export Toast hook for convenience
export { useV2Toast } from './Toast';
