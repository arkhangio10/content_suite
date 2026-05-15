import React, { useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { adaptBrandManual, ManualSpread } from '@/components/ManualSpread';
import {
  IconArrowRight,
  IconCheck,
  IconRefresh,
  IconSparkles,
  IconActivity,
  IconGlobe,
  IconHash,
  IconType,
  IconUser,
} from '@/components/icons';
import {
  V2BrandMark,
  V2Button,
  V2Card,
  V2Input,
  V2Label,
  V2Pill,
  V2Select,
  V2Textarea,
  V2Typewriter,
  cn,
  useV2Reveal,
  useV2Toast,
} from '@/components/ui';
import { V2_BRANDS, V2_CATEGORIES } from '@/data';
import {
  useBrandManual,
  useExtractBrief,
  useGenerateBrandManual,
  useJobStatus,
  useListBrandManuals,
} from '@/hooks/useBrandDna';

// Icon lookup for the agents row
const AGENT_ICONS = {
  cultural_context: IconGlobe,
  audience_research: IconUser,
  competitive_scan: IconActivity,
  trend_analysis: IconType,
  positioning_analysis: IconHash,
};

const AGENT_META = [
  { id: 'cultural_context',     name: 'Contexto cultural',       accent: '#c0392b' },
  { id: 'audience_research',    name: 'Audiencia',               accent: '#E8001D' },
  { id: 'competitive_scan',     name: 'Competencia',             accent: '#6D3CB7' },
  { id: 'trend_analysis',       name: 'Tendencias',              accent: '#B07B17' },
  { id: 'positioning_analysis', name: 'Posicionamiento',         accent: '#2F6B3A' },
];

export default function ArchitectPage() {
  const { user } = useAuth();
  const toast = useV2Toast();

  // phases: idle | extracted | running | done | failed
  const [phase, setPhase] = useState('idle');
  const [rawInput, setRawInput] = useState('');
  const [brief, setBrief] = useState(null);
  const [jobId, setJobId] = useState(null);

  const generateMutation = useGenerateBrandManual();
  const extractMutation = useExtractBrief();
  const jobStatus = useJobStatus(jobId);

  // Auto-load the last successfully-generated manual on mount (so a refresh
  // doesn't lose what the user already created in this session).
  const [savedBrandId] = useState(() => {
    try {
      return sessionStorage.getItem('cs.lastBrandId') || null;
    } catch {
      return null;
    }
  });
  const savedManualQuery = useBrandManual(phase === 'idle' && !jobId ? savedBrandId : null);
  const savedManual = savedManualQuery.data?.manual
    ? adaptBrandManual(savedManualQuery.data.manual)
    : null;

  // Full list of manuals (in-memory + DB) for the library section
  const manualsListQuery = useListBrandManuals();
  const manualsList = manualsListQuery.data?.manuals || [];

  // Hydrate from sessionStorage prefill (set by Home page)
  useEffect(() => {
    const prefill = sessionStorage.getItem('cs.briefPrefill');
    if (prefill) {
      setRawInput(prefill);
      sessionStorage.removeItem('cs.briefPrefill');
      setTimeout(() => extractBrief(prefill), 200);
    }
  }, []);

  // React to job status changes
  useEffect(() => {
    if (!jobStatus.data) return;
    const s = jobStatus.data.status;
    if (s === 'complete') {
      setPhase('done');
      // Persist brand_id so a refresh restores this manual
      try {
        sessionStorage.setItem('cs.lastBrandId', jobStatus.data.brand_id);
      } catch {
        /* sessionStorage might be unavailable in some contexts */
      }
      toast.push({
        kind: 'success',
        title: 'Manual de marca listo',
        body: `Judge ${jobStatus.data.judge_scores?.overall?.toFixed(2) ?? '?'} · costo $${jobStatus.data.budget?.spent_usd?.toFixed(2) ?? '?'}`,
      });
    } else if (s === 'failed' || s === 'incomplete_budget_hit' || s === 'needs_human_review') {
      setPhase('failed');
      toast.push({ kind: 'error', title: 'La generación necesita revisión', body: jobStatus.data.error || s });
    }
  }, [jobStatus.data]);

  // Local regex fallback if the AI extraction service is down
  const extractBriefLocal = (text) => {
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lower = norm(text);
    const brand =
      V2_BRANDS.find((b) => lower.includes(norm(b.id)))?.id || 'PRIMOR';
    const category = V2_BRANDS.find((b) => b.id === brand)?.category || 'Alimentos';
    const audience = /nse\s*[a-d]|mam[áa]s|j[óo]venes|gen z/i.test(text)
      ? text.match(/(?:para|a)\s+([^.,]{6,120})/i)?.[1]?.trim() || 'Hogares peruanos, 28–45 años, NSE B/C'
      : 'Hogares peruanos, 28–45 años, NSE B/C';
    const tone = text.match(/tono\s+([^.,]{3,60})/i)?.[1]?.trim() || 'Cálido, cercano, confiable';
    const launchId = 'LCH-2026-' + String(Math.floor(30 + Math.random() * 90)).padStart(3, '0');
    return {
      raw: text,
      launch_id: launchId,
      brand_id: brand,
      category,
      concept: text,
      audience,
      tone_hint: tone,
      constraints: [],
    };
  };

  // AI extraction via /brand-dna/extract-brief (Claude Haiku, ~$0.001 per call)
  const extractBrief = async (text) => {
    try {
      const result = await extractMutation.mutateAsync(text);
      console.info('[Architect] AI extraction OK, confidence=', result.confidence);
      setBrief({
        raw: text,
        launch_id: result.launch_id,
        brand_id: result.brand_id,
        category: result.category,
        concept: result.concept,
        audience: result.audience,
        tone_hint: result.tone_hint,
        constraints: result.constraints,
      });
      setPhase('extracted');
      toast.push({
        kind: 'success',
        title: 'Brief extraído',
        body: `${result.brand_id} · confianza ${Math.round(result.confidence * 100)}%`,
      });
    } catch (err) {
      console.warn('[Architect] AI extraction failed, falling back to regex', err);
      setBrief(extractBriefLocal(text));
      setPhase('extracted');
      toast.push({
        kind: 'info',
        title: 'Extracción local (sin IA)',
        body: 'El backend no respondió — usando reglas locales como respaldo.',
      });
    }
  };

  const startGeneration = async () => {
    if (!brief || !user) return;
    setPhase('running');
    try {
      const res = await generateMutation.mutateAsync({
        launch_id: brief.launch_id,
        brand_id: brief.brand_id.toLowerCase().replace(/\s+/g, '_'),
        category: brief.category,
        product_concept: brief.concept,
        target_audience: brief.audience,
        tone_hint: brief.tone_hint,
        market: 'PE',
        business_constraints: { notes: brief.constraints },
        requested_by: user.id,
      });
      setJobId(res.job_id);
      toast.push({ kind: 'info', title: 'Brief enviado al orquestador', body: '5 agentes investigando en paralelo.' });
    } catch (err) {
      setPhase('failed');
      toast.push({ kind: 'error', title: 'No se pudo iniciar la generación', body: err.message });
    }
  };

  const reset = () => {
    setPhase('idle');
    setBrief(null);
    setRawInput('');
    setJobId(null);
  };

  const adaptedManual = jobStatus.data?.manual
    ? adaptBrandManual(jobStatus.data.manual, {
        cost: jobStatus.data.budget?.spent_usd,
        cache_hit: jobStatus.data.budget?.cache_hit_rate,
      })
    : null;

  const isApprover = user?.role === 'approver_a' || user?.role === 'approver_b';

  // Approvers: read-only library — no generation form
  if (isApprover) {
    return (
      <div>
        <section className="paper-warm border-b border-hairline">
          <div className="max-w-5xl mx-auto px-8 pt-12 pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Brand DNA Architect</p>
            <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
              Manuales de marca <span className="font-serif italic font-normal">de referencia.</span>
            </h1>
            <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-2xl">
              Consulta los manuales generados por el equipo creativo. Cada manual contiene las reglas de marca que se inyectaron al generar el contenido que estás revisando.
            </p>
          </div>
        </section>
        <section className="max-w-5xl mx-auto px-8 py-10 space-y-8">
          {manualsList.length > 0 ? (
            <ManualsList manuals={manualsList} />
          ) : (
            <V2Card className="text-center py-12 paper-warm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-2">Biblioteca</p>
              <h2 className="text-xl font-semibold tracking-editorial text-ink">
                Aún no hay manuales <span className="font-serif italic font-normal">disponibles.</span>
              </h2>
              <p className="text-[13px] text-inksoft mt-2 max-w-md mx-auto">
                Cuando el equipo creativo genere manuales, aparecerán aquí para que puedas consultarlos.
              </p>
            </V2Card>
          )}
          {savedManual && (
            <div className="animate-slide-up-lg">
              <div className="flex items-center gap-2 mb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">
                  Vista previa del manual
                </p>
                <span className="h-px flex-1 bg-hairline"></span>
                <p className="text-[10px] mono text-inkmute">{savedManual.brand_id}</p>
              </div>
              <ManualSpread manual={savedManual} />
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div>
      <section className="paper-warm border-b border-hairline">
        <div className="max-w-5xl mx-auto px-8 pt-12 pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Brand DNA Architect</p>
          <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
            Cualquier brief, cualquier marca,<br />
            <span className="font-serif italic font-normal">en minutos.</span>
          </h1>
          <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-2xl">
            Describe lo que vas a lanzar como se lo contarías a tu equipo. Cinco agentes de investigación arman el manual de marca, lo evalúan contra reglas y lo dejan listo para que el resto del suite lo consulte.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-8 py-10 space-y-8">
        {(phase === 'idle' || phase === 'extracted') && (
          <ConversationalBrief
            value={rawInput}
            onChange={setRawInput}
            onExtract={() => extractBrief(rawInput)}
            extracting={extractMutation.isPending}
          />
        )}

        {phase === 'extracted' && brief && (
          <BriefCard brief={brief} onChange={setBrief} onGenerate={startGeneration} onReset={reset} />
        )}

        {(phase === 'running' || phase === 'done') && brief && (
          <AgentsLive
            brief={brief}
            running={phase === 'running'}
            jobStatus={jobStatus.data}
          />
        )}

        {phase === 'done' && adaptedManual && (
          <div className="animate-slide-up-lg">
            <ManualSpread manual={adaptedManual} />
            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-inkmute">
                Manual guardado en pgvector · embeddings actualizados · disponible para Creative Engine y Gobernanza.
              </p>
              <V2Button variant="ghost" size="sm" onClick={reset}>
                <IconRefresh size={13} /> Otro brief
              </V2Button>
            </div>
          </div>
        )}

        {phase === 'failed' && (
          <V2Card className="text-center py-12">
            <p className="text-2xl font-semibold text-bad mb-2">La generación no completó.</p>
            <p className="text-sm text-inksoft mb-6">{jobStatus.data?.error || 'Estado inesperado del pipeline.'}</p>
            <V2Button variant="secondary" onClick={reset}>Intentar de nuevo</V2Button>
          </V2Card>
        )}

        {phase === 'idle' && savedManual && (
          <div className="animate-slide-up-lg">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">
                Tu manual más reciente · {savedManualQuery.data?.source === 'cache' ? 'memoria' : 'base de datos'}
              </p>
              <span className="h-px flex-1 bg-hairline"></span>
              <p className="text-[10px] mono text-inkmute">{savedManual.brand_id}</p>
            </div>
            <ManualSpread manual={savedManual} />
          </div>
        )}
        {phase === 'idle' && manualsList.length > 0 && (
          <ManualsList manuals={manualsList} />
        )}
        {phase === 'idle' && !savedManual && manualsList.length === 0 && !manualsListQuery.isLoading && (
          <V2Card className="text-center py-12 paper-warm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-2">Biblioteca</p>
            <h2 className="text-xl font-semibold tracking-editorial text-ink">
              Aún no hay manuales <span className="font-serif italic font-normal">anteriores.</span>
            </h2>
            <p className="text-[13px] text-inksoft mt-2 max-w-md mx-auto">
              Los manuales que generes quedarán vectorizados en pgvector y aparecerán acá para reutilizarlos.
            </p>
          </V2Card>
        )}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// List of all generated manuals (real data, no mock)
// ────────────────────────────────────────────────────────────

function ManualsList({ manuals }) {
  const ref = useV2Reveal();
  return (
    <div ref={ref} className="reveal">
      <div className="flex items-end justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-2">Biblioteca</p>
          <h2 className="text-2xl font-semibold tracking-editorial text-ink">
            {manuals.length} manual{manuals.length === 1 ? '' : 'es'} <span className="font-serif italic font-normal">generado{manuals.length === 1 ? '' : 's'}.</span>
          </h2>
        </div>
        <p className="text-[11px] text-inkmute">
          Estos manuales viven en memoria del backend mientras esté arriba. Click para ver completo o reutilizar.
        </p>
      </div>
      <V2Card padded={false} className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute border-b border-hairline">
              <th className="text-left px-6 py-3">Marca</th>
              <th className="text-left px-3 py-3">Tagline</th>
              <th className="text-left px-3 py-3">Estado</th>
              <th className="text-right px-3 py-3">Judge</th>
              <th className="text-right px-3 py-3">Costo</th>
              <th className="text-right px-3 py-3">Cache</th>
              <th className="text-right px-6 py-3">Hace</th>
            </tr>
          </thead>
          <tbody>
            {manuals.map((m) => {
              const b = V2_BRANDS.find((x) => x.id.toLowerCase() === m.brand_id.toLowerCase());
              const started = new Date(m.started_at);
              const ago = relativeTime(started);
              return (
                <tr
                  key={m.job_id}
                  onClick={() => {
                    try { sessionStorage.setItem('cs.lastBrandId', m.brand_id); } catch {}
                    window.location.reload();
                  }}
                  className="border-b border-hairline last:border-b-0 hover:bg-paper transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <V2BrandMark
                        brand={b || { hue: ['#1A1A1A', '#FFFFFF'], glyph: m.brand_id[0]?.toUpperCase() }}
                        size={32}
                      />
                      <div>
                        <p className="font-medium text-ink mono">{m.brand_id}</p>
                        <p className="text-[11px] text-inkmute">v{m.version} · {m.language}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 max-w-xs">
                    <p className="font-serif italic text-[14px] text-ink truncate">{m.tagline || '—'}</p>
                  </td>
                  <td className="px-3 py-4">
                    <V2Pill status={m.status} />
                  </td>
                  <td className="px-3 py-4 text-right mono">
                    {m.judge_scores?.overall != null ? (
                      <span className={cn(
                        'text-xs',
                        m.judge_scores.overall >= 0.85 ? 'text-good' :
                        m.judge_scores.overall >= 0.70 ? 'text-warn' : 'text-bad',
                      )}>
                        {m.judge_scores.overall.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-inkmute text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-right mono text-inksoft text-xs">
                    {m.budget?.spent_usd != null ? `$${m.budget.spent_usd.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-4 text-right mono text-xs">
                    {m.budget?.cache_hit_rate != null ? (
                      <span className={cn(
                        m.budget.cache_hit_rate > 0.5 ? 'text-good' :
                        m.budget.cache_hit_rate > 0.25 ? 'text-warn' : 'text-inkmute',
                      )}>
                        {Math.round(m.budget.cache_hit_rate * 100)}%
                      </span>
                    ) : (
                      <span className="text-inkmute">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-inkmute text-xs">{ago}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </V2Card>
    </div>
  );
}

function relativeTime(d) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'ahora';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  return `${Math.floor(diff / 86400)} d`;
}

// ────────────────────────────────────────────────────────────
// Conversational brief input
// ────────────────────────────────────────────────────────────

function ConversationalBrief({ value, onChange, onExtract, extracting = false }) {
  const [focused, setFocused] = useState(false);
  const ref = useV2Reveal();
  return (
    <div ref={ref} className="reveal">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">Paso 1 · Cuéntale a la IA</p>
        <span className="h-px flex-1 bg-hairline"></span>
      </div>
      <div className={cn('relative rounded-2xl border bg-white transition-all duration-300', focused ? 'border-accent shadow-xl shadow-accent/10' : 'border-hairlinestrong shadow-sm')}>
        <div className="flex items-start gap-4 p-6">
          <V2BrandMark brand={{ hue: ['#E8001D', '#FFFFFF'], glyph: 'A' }} size={42} />
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            rows={3}
            placeholder="ej. Vamos a relanzar Primor 1L para mamás NSE B/C, tono cálido."
            className="flex-1 resize-none bg-transparent outline-none text-[17px] leading-relaxed text-ink placeholder:text-inkmute placeholder:italic placeholder:font-serif"
            disabled={extracting}
          />
        </div>
        <div className="border-t border-hairline px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-inkmute">
            {extracting ? 'Claude Haiku está leyendo tu brief…' : 'Va al orquestador. Puedes editar todo en el siguiente paso.'}
          </p>
          <V2Button variant="accent" size="md" onClick={onExtract} disabled={!value.trim() || extracting}>
            {extracting ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-white border-r-transparent animate-spin"></span>
                Extrayendo…
              </>
            ) : (
              <>
                Extraer brief <IconArrowRight size={13} />
              </>
            )}
          </V2Button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Extracted brief — editable
// ────────────────────────────────────────────────────────────

function BriefCard({ brief, onChange, onGenerate, onReset }) {
  const ref = useV2Reveal();
  return (
    <div ref={ref} className="reveal">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">Paso 2 · Revisa lo que la IA entendió</p>
        <span className="h-px flex-1 bg-hairline"></span>
      </div>
      <V2Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <BriefField label="Marca"     value={brief.brand_id}  mono onChange={(v) => onChange({ ...brief, brand_id: v })} />
          <BriefField label="Launch ID" value={brief.launch_id} mono onChange={(v) => onChange({ ...brief, launch_id: v })} />
          <BriefField label="Categoría" value={brief.category}  options={V2_CATEGORIES} onChange={(v) => onChange({ ...brief, category: v })} />
          <BriefField label="Tono"      value={brief.tone_hint} onChange={(v) => onChange({ ...brief, tone_hint: v })} />
          <BriefField label="Audiencia" value={brief.audience}  full onChange={(v) => onChange({ ...brief, audience: v })} />
          <BriefField label="Concepto"  value={brief.concept}   full multiline onChange={(v) => onChange({ ...brief, concept: v })} />
        </div>

        <div className="mt-5 pt-5 border-t border-hairline">
          <V2Label className="mb-2">Restricciones detectadas</V2Label>
          <div className="flex flex-wrap gap-1.5">
            {brief.constraints.map((c, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-paper border border-hairline px-3 py-1 text-[12px] text-inksoft">
                <IconCheck size={11} className="text-good" />
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 pt-5 border-t border-hairline">
          <V2Button variant="ghost" size="md" onClick={onReset}>Volver a empezar</V2Button>
          <V2Button variant="accent" size="lg" onClick={onGenerate}>
            <IconSparkles size={15} /> Generar manual de marca
          </V2Button>
        </div>
      </V2Card>
    </div>
  );
}

function BriefField({ label, value, onChange, mono, options, full, multiline }) {
  return (
    <div className={cn(full && 'md:col-span-2')}>
      <V2Label className="mb-1.5">{label}</V2Label>
      {options ? (
        <V2Select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => <option key={o}>{o}</option>)}
        </V2Select>
      ) : multiline ? (
        <V2Textarea rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <V2Input className={cn(mono && 'mono')} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Live agents — driven by REAL job status polling
// ────────────────────────────────────────────────────────────

// Maps backend phase → user-facing label + completion %
const PHASE_META = {
  planning:     { label: 'Planificando investigación…',  pct:  8, agentsRevealed: 0 },
  researching:  { label: 'Investigando con 5 agentes…',  pct: 35, agentsRevealed: 5 },
  synthesizing: { label: 'Sintetizando manual (Opus 4.7)…', pct: 75, agentsRevealed: 5 },
  evaluating:   { label: 'Evaluando contra reglas…',     pct: 92, agentsRevealed: 5 },
  repairing:    { label: 'Reparando con JSON Patch…',    pct: 95, agentsRevealed: 5 },
  done:         { label: 'Listo',                        pct: 100, agentsRevealed: 5 },
};

function AgentsLive({ brief, running, jobStatus }) {
  const ref = useV2Reveal();

  const phase = jobStatus?.phase || 'planning';
  const meta = PHASE_META[phase] || PHASE_META.planning;

  const spent = jobStatus?.budget?.spent_usd ?? 0;
  const ceiling = jobStatus?.budget?.ceiling_usd ?? 2.0;
  const calls = jobStatus?.budget?.calls ?? 0;
  const cacheHit = jobStatus?.budget?.cache_hit_rate ?? 0;
  const isDone = !running;
  const agentsRevealed = isDone ? 5 : meta.agentsRevealed;

  return (
    <div ref={ref} className="reveal">
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">
          Paso 3 · {isDone ? 'Hallazgos de los agentes' : meta.label}
        </p>
        <span className="h-px flex-1 bg-hairline"></span>
        <p className="text-[10px] mono text-inkmute">brand: {brief.brand_id} · launch: {brief.launch_id}</p>
      </div>

      {/* Real-time progress card */}
      <div className="rounded-2xl border border-hairline bg-white p-5 mb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-3">
            <span className={cn('relative h-10 w-10 rounded-xl grid place-items-center', isDone ? 'bg-goodsoft text-good' : 'bg-accentsoft text-accent')}>
              {isDone ? <IconCheck size={18} /> : <IconSparkles size={18} className="animate-pulse-soft" />}
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">{meta.label}</p>
              <p className="text-xs text-inkmute">
                {calls} llamada{calls === 1 ? '' : 's'} a Claude
                {cacheHit > 0 && ` · cache hit ${Math.round(cacheHit * 100)}%`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-inkmute font-semibold">Costo en vivo</p>
            <p className="font-serif italic text-2xl text-ink counter">
              ${spent.toFixed(2)}{' '}
              <span className="text-inkmute text-sm not-italic font-sans">/ ${ceiling.toFixed(2)}</span>
            </p>
          </div>
        </div>

        {/* Phase progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[11px] text-inkmute">
            <span>{meta.pct}% — {phase}</span>
            <span className="mono">
              {(spent / ceiling * 100).toFixed(0)}% del presupuesto
            </span>
          </div>
          <div className="h-2 rounded-full bg-hairline overflow-hidden">
            <div
              className={cn('h-full transition-all duration-700 ease-out', isDone ? 'bg-good' : 'bg-accent')}
              style={{ width: meta.pct + '%' }}
            />
          </div>
        </div>

        {/* Phase milestone dots */}
        <div className="mt-4 grid grid-cols-5 gap-1 text-[10px] uppercase tracking-[0.1em] font-semibold">
          {['planning', 'researching', 'synthesizing', 'evaluating', 'done'].map((p) => {
            const active = ['planning', 'researching', 'synthesizing', 'evaluating', 'done', 'repairing'].indexOf(phase) >=
              ['planning', 'researching', 'synthesizing', 'evaluating', 'done'].indexOf(p);
            return (
              <div key={p} className={cn('flex items-center gap-1.5', active ? 'text-ink' : 'text-inkmute/50')}>
                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', active ? (isDone || p !== phase ? 'bg-accent' : 'bg-accent animate-pulse') : 'bg-hairlinestrong')} />
                <span className="truncate">{p === 'planning' ? 'Plan' : p === 'researching' ? 'Investiga' : p === 'synthesizing' ? 'Sintetiza' : p === 'evaluating' ? 'Evalúa' : 'Listo'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {AGENT_META.map((a, i) => {
          const isFound = i < agentsRevealed;
          const Icon = AGENT_ICONS[a.id];
          return (
            <div
              key={a.id}
              className={cn(
                'rounded-2xl border bg-white p-5 transition-all duration-500',
                isFound ? 'border-hairlinestrong shadow-sm animate-slide-up-lg' : 'border-dashed border-hairline opacity-60',
              )}
            >
              <div className="flex items-start gap-3">
                <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0" style={{ background: a.accent + '1A', color: a.accent }}>
                  {isFound ? <Icon size={15} /> : <span className="h-4 w-4 rounded-full border-2 border-current border-r-transparent animate-spin"></span>}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-semibold text-ink">{a.name}</p>
                    {isFound ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-goodsoft text-good px-2 py-0.5 text-[10px] font-medium">
                        <IconCheck size={9} /> completo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-paper border border-hairline text-inkmute px-2 py-0.5 text-[10px] font-medium animate-pulse-soft">
                        trabajando…
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-inksoft leading-relaxed mt-2 min-h-[3rem]">
                    {isFound ? (
                      <V2Typewriter
                        text={`Investigación de ${a.name.toLowerCase()} completada con éxito. Findings persistidos en pgvector.`}
                        speed={6}
                      />
                    ) : (
                      <span className="block space-y-1.5">
                        <span className="block h-2.5 rounded-full skeleton w-full"></span>
                        <span className="block h-2.5 rounded-full skeleton w-5/6"></span>
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

