import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { isSupabaseConfigured } from '@/auth/supabase';
import { IconAlert, IconArrowRight } from '@/components/icons';
import { LogoBadge, V2WordReveal } from '@/components/ui';

interface DemoAccount {
  email: string;
  password: string;
  label: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: 'maria.torres@demo.alicorp.com',     password: 'creador_demo_2026',     label: 'Creador' },
  { email: 'carlos.ramirez@demo.alicorp.com',   password: 'aprobador_a_demo_2026', label: 'Aprobador A' },
  { email: 'lucia.fernandez@demo.alicorp.com',  password: 'aprobador_b_demo_2026', label: 'Aprobador B' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState(DEMO_ACCOUNTS[0].password);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setErr('Ingresa un correo válido.');
      return;
    }
    if (password.length < 6) {
      setErr('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setBusy(true);
    setErr('');
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    navigate('/', { replace: true });
  };

  const RoleBadge = ({ label }: { label: string }) => (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: '#FFF0F0', color: '#E8001D' }}
    >
      {label}
    </span>
  );

  return (
    <div className="h-screen w-screen flex" style={{ background: '#FFFFFF' }}>
      {/* LEFT PANEL */}
      <div className="hidden md:flex relative flex-1 overflow-hidden flex-col" style={{ background: '#FFFFFF' }}>
        <div className="absolute top-8 left-10 flex items-center gap-3 z-10">
          <LogoBadge size={40} />
          <div>
            <p className="text-[14px] font-bold tracking-tight" style={{ color: '#1A1A1A' }}>Content Suite</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#E8001D' }}>Plataforma de marca</p>
          </div>
        </div>

        <div className="relative z-10 flex flex-col justify-center flex-1 px-16 max-w-[640px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-5" style={{ color: '#888888' }}>
            Alicorp · Herramienta interna
          </p>
          <h1 className="font-bold leading-[0.98] tracking-tight" style={{ fontSize: 'clamp(42px,5vw,66px)', color: '#1A1A1A' }}>
            <span className="block overflow-hidden"><V2WordReveal text="Un brief." /></span>
            <span className="block overflow-hidden" style={{ color: '#E8001D' }}><V2WordReveal text="Un manual." delay={320} /></span>
            <span className="block overflow-hidden"><V2WordReveal text="Una marca consistente." delay={640} /></span>
          </h1>
          <p
            className="text-[15px] leading-relaxed mt-8 max-w-md animate-fade-up"
            style={{ color: '#444444', animationDelay: '1.1s' }}
          >
            Convierte un brief en un manual de marca completo, valida cada pieza de contenido contra él y deja rastro auditable de cada decisión.
          </p>

          <div className="mt-12 flex items-center gap-10 animate-fade-up" style={{ animationDelay: '1.3s' }}>
            {[['5', 'Agentes paralelos'], ['$0.96', 'Costo por manual'], ['Langfuse', 'Trace anidado']].map(([n, l], i) => (
              <div key={l} className="flex items-center gap-10">
                {i > 0 && <div style={{ width: 1, height: 40, background: '#E8E8E8' }} />}
                <div>
                  <p className="text-3xl font-bold leading-none" style={{ color: '#E8001D' }}>{n}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mt-1.5" style={{ color: '#888888' }}>{l}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          className="absolute bottom-8 left-16 flex items-center gap-2 text-[11px]"
          style={{ color: '#888888', fontFamily: 'JetBrains Mono, monospace' }}
        >
          <span className="h-1.5 w-1.5 rounded-full animate-pulse-soft" style={{ background: '#E8001D' }}></span>
          sistema operativo · último incidente hace 23 días
        </div>
        <p
          className="absolute bottom-8 right-10 text-[11px]"
          style={{ color: '#888888', fontFamily: 'JetBrains Mono, monospace' }}
        >
          v1.0 · pgvector · FastAPI · Langfuse
        </p>
      </div>

      {/* RIGHT PANEL — form */}
      <div
        className="relative w-full md:w-[460px] xl:w-[520px] flex items-center justify-center px-8 py-12 border-l"
        style={{ background: '#F5F5F5', borderColor: '#E8E8E8' }}
      >
        <div className="absolute top-6 right-6 text-xs" style={{ color: '#888888' }}>
          ¿Problemas? <a className="link-underline" style={{ color: '#1A1A1A' }}>contactar IT</a>
        </div>

        <div className="w-full max-w-sm animate-fade-up">
          <div className="flex items-center gap-3 mb-8 md:hidden">
            <LogoBadge size={36} />
            <p className="font-bold text-sm" style={{ color: '#1A1A1A' }}>Content Suite</p>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-5 rounded-lg border border-bad/30 bg-badsoft/40 p-3 text-[12px] text-bad leading-snug">
              <p className="font-semibold flex items-center gap-1.5"><IconAlert size={12} /> Configuración faltante</p>
              <p className="mt-1 text-[11px] text-bad/90">
                Crea <span className="mono">v1/frontend/.env.local</span> con <span className="mono">VITE_SUPABASE_URL</span>, <span className="mono">VITE_SUPABASE_ANON_KEY</span> y <span className="mono">VITE_API_BASE_URL</span> (ver <span className="mono">.env.example</span>).
              </p>
            </div>
          )}
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] mb-3" style={{ color: '#E8001D' }}>
            Iniciar sesión
          </p>
          <h2 className="text-[28px] font-bold tracking-tight" style={{ color: '#1A1A1A' }}>Bienvenido de vuelta.</h2>
          <p className="text-sm mt-2" style={{ color: '#444444' }}>Usa tu correo corporativo para entrar al suite.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#888888' }}>Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tunombre@alicorp.com.pe"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-shadow"
                style={{ border: '1px solid #CCCCCC', background: '#FFFFFF', color: '#1A1A1A' }}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] mb-1.5" style={{ color: '#888888' }}>Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-shadow"
                style={{ border: '1px solid #CCCCCC', background: '#FFFFFF', color: '#1A1A1A' }}
              />
            </div>
            {err && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: '#E8001D' }}>
                <IconAlert size={13} />
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: '#E8001D', color: '#FFFFFF' }}
            >
              {busy ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-r-transparent animate-spin"></span>
                  Entrando…
                </>
              ) : (
                <>
                  Entrar <IconArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          <div className="mt-7 pt-6" style={{ borderTop: '1px solid #E8E8E8' }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: '#888888' }}>
              Cuentas demo — clic para autocompletar
            </p>
            <div className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(a.password);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white"
                >
                  <RoleBadge label={a.label} />
                  <span className="flex-1 truncate text-[13px]" style={{ color: '#444444' }}>{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
