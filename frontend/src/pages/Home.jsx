import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  IconArrowRight,
  IconBook,
  IconRefresh,
  IconShield,
  IconSparkles,
  IconWand,
} from '@/components/icons';
import { V2Button, V2Card, cn } from '@/components/ui';
import { V2_SUGGESTIONS } from '@/data';

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  })();

  const send = () => {
    if (!input.trim()) return;
    sessionStorage.setItem('cs.briefPrefill', input);
    navigate('/brand-dna');
  };

  return (
    <div>
      {/* Hero band */}
      <section className="paper-warm border-b border-hairline relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-8 pt-14 pb-12">
          <div className="flex items-start justify-between gap-6 mb-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-3">
                {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <h1 className="text-[44px] md:text-[60px] font-bold tracking-editorial leading-[1.0] text-ink">
                {greeting}, <span className="font-serif italic font-normal">{user?.full_name.split(' ')[0]}.</span>
              </h1>
              <p className="text-inksoft text-[15px] leading-relaxed mt-3 max-w-xl">
                Aquí empieza cada lanzamiento. Describe un producto y la IA arma el manual de marca completo, vectorizado y listo para Creative Engine.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 mt-2">
              <V2Button variant="secondary" size="md"><IconRefresh size={14} /> Sincronizar</V2Button>
              <V2Button variant="primary" size="md" onClick={() => navigate('/brand-dna')}>
                Nuevo brief <IconArrowRight size={14} />
              </V2Button>
            </div>
          </div>

          {/* Conversational input */}
          <div className={cn('relative rounded-2xl bg-white border transition-all duration-300', focused ? 'border-accent shadow-xl shadow-accent/10' : 'border-hairlinestrong shadow-sm')}>
            <div className="flex items-start gap-4 p-5">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-ink text-paper grid place-items-center mt-0.5"><IconSparkles size={16} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute mb-1.5">Cuéntame en una línea</p>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
                  rows={2}
                  placeholder="ej. Vamos a relanzar Primor 1L para mamás NSE B/C, tono cálido y confiable."
                  className="w-full resize-none bg-transparent outline-none text-[17px] leading-relaxed text-ink placeholder:text-inkmute placeholder:font-normal placeholder:italic placeholder:font-serif"
                />
              </div>
              <V2Button variant={input.trim() ? 'accent' : 'secondary'} size="md" onClick={send} disabled={!input.trim()}>
                Empezar <IconArrowRight size={14} />
              </V2Button>
            </div>
            <div className="border-t border-hairline px-5 py-3 flex items-center gap-3 flex-wrap">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">o intenta</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {V2_SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(s)}
                    className="rounded-full bg-paper hover:bg-paperwarm border border-hairline px-3 py-1 text-[12px] text-inksoft hover:text-ink transition-colors"
                  >
                    {s.split(' ').slice(0, 6).join(' ')}…
                  </button>
                ))}
              </div>
              <span className="ml-auto mono text-[10px] text-inkmute hidden md:inline">⌘ ↵ enviar</span>
            </div>
          </div>
        </div>
      </section>

      {/* Empty state — nothing generated yet */}
      <section className="max-w-6xl mx-auto px-8 py-14">
        <V2Card className="text-center py-16 paper-warm">
          <div className="h-14 w-14 rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-5">
            <IconBook size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-editorial text-ink">
            Aún no has generado <span className="font-serif italic font-normal">ningún manual.</span>
          </h2>
          <p className="text-inksoft text-[14px] leading-relaxed mt-3 max-w-md mx-auto">
            Los manuales que crees, el contenido que generes y los traces de cada interacción aparecerán acá. Empieza por un brief en lenguaje natural.
          </p>
          <V2Button variant="accent" size="md" className="mt-6" onClick={() => navigate('/brand-dna')}>
            Crear primer manual <IconArrowRight size={14} />
          </V2Button>
        </V2Card>
      </section>

      {/* How it works strip — pure educational, no fake data */}
      <section className="bg-white border-y border-hairline">
        <div className="max-w-6xl mx-auto px-8 py-14">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-3">Así trabaja Content Suite</p>
          <h2 className="text-3xl font-semibold tracking-editorial text-ink mb-10 max-w-2xl">
            Del brief al spot, sin que nadie repita las reglas de la marca.
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { n: '01', t: 'Brief en lenguaje natural',    d: 'Escribes lo que vas a lanzar. Claude Haiku extrae brand, audiencia y tono.',                       icon: <IconSparkles size={14} /> },
              { n: '02', t: 'Manual de marca en minutos',   d: 'Cinco agentes (Claude Haiku) investigan en paralelo. Opus sintetiza. Sonnet evalúa.',              icon: <IconBook size={14} /> },
              { n: '03', t: 'Contenido que respeta reglas', d: 'Cada pieza se consulta contra el manual (pgvector) antes de salir. Vocabulario prohibido se filtra.', icon: <IconWand size={14} /> },
              { n: '04', t: 'Aprobación con trazabilidad',  d: 'Texto y visual auditados. Cada decisión queda en Langfuse.',                                       icon: <IconShield size={14} /> },
            ].map((s) => (
              <li key={s.n} className="relative">
                <p className="font-serif italic text-2xl text-inkmute mb-3">{s.n}</p>
                <span className="absolute left-0 top-12 h-px w-8 bg-accent"></span>
                <p className="text-[13px] font-semibold text-ink mt-6 mb-2 flex items-center gap-1.5">{s.icon} {s.t}</p>
                <p className="text-sm text-inksoft leading-relaxed">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-8 py-8 flex items-center justify-between text-[11px] text-inkmute">
        <p className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-good animate-pulse-soft"></span>Backend FastAPI · pgvector · Langfuse · Claude (Opus 4.7 · Sonnet 4.6 · Haiku 4.5)</p>
        <p className="mono">Content Suite · v1.0 · 2026</p>
      </footer>
    </div>
  );
}
