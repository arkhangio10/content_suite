import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconArrowRight,
  IconCheck,
  IconCopy,
  IconDownload,
  IconX,
} from './icons';
import {
  V2BrandMark,
  V2Button,
  V2Dial,
  V2Label,
  V2Pill,
  cn,
  useV2Reveal,
  useV2Toast,
} from './ui';
import { V2_BRANDS } from '@/data';

/**
 * Render the editorial magazine spread of a brand manual.
 * Accepts the legacy "flat" shape used by V2_MANUAL_PRIMOR.
 * Use adaptBrandManual() to convert a real API BrandManual into this shape.
 */
export function ManualSpread({ manual }) {
  const navigate = useNavigate();
  const toast = useV2Toast();
  const b =
    V2_BRANDS.find((x) => x.id === manual.brand_id) ||
    { hue: manual.hue || ['#E8001D', '#FFFFFF'], glyph: manual.brand_id?.[0] || '?' };
  const ref = useV2Reveal();

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(manual, null, 2));
      toast.push({ kind: 'success', title: 'JSON copiado al portapapeles' });
    } catch (err) {
      toast.push({ kind: 'error', title: 'No se pudo copiar', body: String(err) });
    }
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(manual, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brand-manual-${manual.brand_id || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.push({ kind: 'success', title: 'JSON descargado' });
  };

  const useInCreative = () => {
    try {
      sessionStorage.setItem('cs.lastBrandId', manual.brand_id);
    } catch {
      /* ignore */
    }
    navigate('/creative');
  };

  return (
    <article ref={ref} className="reveal rounded-3xl border border-hairline overflow-hidden bg-white">
      {/* COVER */}
      <header className="relative paper-warm border-b border-hairline">
        <div className="relative px-10 pt-12 pb-10 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">Manual de marca</p>
            <p className="text-[13px] mono text-inkmute mb-6">{manual.id} · {manual.launch_id} · {manual.category}</p>
            <h2 className="font-serif italic text-[56px] md:text-[80px] leading-[0.95] tracking-editorial text-ink mb-6">
              "{manual.summary.tagline}"
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <V2Pill status={manual.status} />
              <span className="text-[12px] text-inkmute">
                {manual.cost != null && `costo $${manual.cost.toFixed(2)} · `}
                {manual.cache_hit != null && `cache ${Math.round(manual.cache_hit * 100)}%`}
              </span>
            </div>
          </div>
          <div className="hidden md:block">
            <V2BrandMark brand={b} size={140} />
            <p className="text-[10px] mono text-inkmute mt-3 text-center">{manual.brand_id}</p>
          </div>
        </div>
        <div className="absolute top-6 right-10 text-[10px] mono text-inkmute">01 — Identidad</div>
      </header>

      {/* POSITIONING */}
      <section className="px-10 py-12 border-b border-hairline grid grid-cols-1 md:grid-cols-12 gap-8 relative">
        <div className="md:col-span-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">02 — Posicionamiento</p>
          <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Una promesa, no un claim.</p>
        </div>
        <div className="md:col-span-5 space-y-5 text-[15px] leading-[1.7] text-inksoft">
          <p>{manual.summary.positioning}</p>
          <p className="text-ink font-medium">
            <span className="text-inkmute font-normal">Promesa: </span>
            {manual.summary.promise}
          </p>
        </div>
        <div className="md:col-span-4 paper-warm rounded-2xl p-6 self-start">
          <V2Label className="mb-3">Audiencia</V2Label>
          <p className="text-[14px] leading-relaxed text-ink">{manual.audience}</p>
          <V2Label className="mt-5 mb-2">Tono</V2Label>
          <p className="font-serif italic text-[18px] text-ink">{manual.tone_hint}</p>
        </div>
      </section>

      {/* PILLARS */}
      {manual.pillars?.length > 0 && (
        <section className="px-10 py-12 border-b border-hairline">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8">
            <div className="md:col-span-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">03 — Pilares</p>
              <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Tres ideas que no se negocian.</p>
            </div>
            <div className="md:col-span-9">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {manual.pillars.slice(0, 3).map((p, i) => (
                  <div key={i} className="rounded-2xl border border-hairline p-6 hover:border-hairlinestrong transition-colors">
                    <p className="font-serif italic text-2xl text-ink mb-2">{String(i + 1).padStart(2, '0')}.</p>
                    <p className="text-[14px] font-semibold text-ink mb-2">{p.title}</p>
                    <p className="text-[13px] text-inksoft leading-relaxed">{p.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* VOCABULARY */}
      {manual.vocab && (
        <section className="px-10 py-14 border-b border-hairline grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">04 — Vocabulario</p>
            <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Palabras que sí.<br />Y las que jamás.</p>
            <p className="text-[13px] text-inksoft leading-relaxed mt-4">El RAG consulta esta lista en cada generación. Las prohibidas se filtran antes de que salgan del modelo.</p>
          </div>
          <div className="md:col-span-9 space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-good"></span>
                <V2Label>Preferidas <span className="text-inkmute normal-case font-normal">· {manual.vocab.preferred.length}</span></V2Label>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5 items-baseline">
                {manual.vocab.preferred.map((w, i) => (
                  <span key={w} className="font-serif italic text-ink" style={{ fontSize: 16 + ((i * 3) % 18) + 'px' }}>
                    {w}<span className="text-inkmute font-sans not-italic text-[12px] ml-1">·</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-bad"></span>
                <V2Label>Prohibidas <span className="text-inkmute normal-case font-normal">· {manual.vocab.forbidden.length}</span></V2Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {manual.vocab.forbidden.map((w) => (
                  <span key={w} className="inline-block rounded-md bg-badsoft text-bad px-2.5 py-1 text-[13px] line-through decoration-bad/40">{w}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TONE */}
      {manual.tone && (
        <section className="px-10 py-12 border-b border-hairline grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">05 — Tono de voz</p>
            <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Cómo suena la marca.<br />Y cómo nunca debería sonar.</p>
          </div>
          <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-goodsoft/40 border border-good/20 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-8 w-8 rounded-full bg-good text-white grid place-items-center"><IconCheck size={14} /></span>
                <p className="font-serif italic text-2xl text-good">Sí.</p>
              </div>
              <ul className="space-y-2.5">
                {manual.tone.dos.map((d, i) => (
                  <li key={i} className="text-[14px] text-ink leading-relaxed flex gap-3">
                    <span className="text-inkmute mono text-[11px] mt-1 w-4">{String(i + 1).padStart(2, '0')}</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-badsoft/40 border border-bad/20 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-8 w-8 rounded-full bg-bad text-white grid place-items-center"><IconX size={14} /></span>
                <p className="font-serif italic text-2xl text-bad">No.</p>
              </div>
              <ul className="space-y-2.5">
                {manual.tone.donts.map((d, i) => (
                  <li key={i} className="text-[14px] text-ink leading-relaxed flex gap-3">
                    <span className="text-inkmute mono text-[11px] mt-1 w-4">{String(i + 1).padStart(2, '0')}</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* CULTURAL */}
      {manual.cultural?.length > 0 && (
        <section className="paper-warm px-10 py-14 border-b border-hairline grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">06 — Contexto cultural</p>
            <p className="font-serif italic text-[32px] leading-[1.05] text-ink">El terreno donde vive la marca.</p>
          </div>
          <div className="md:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-5">
            {manual.cultural.map((c, i) => (
              <div key={i} className="border-l-2 border-ink pl-5 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute mb-1">{String(i + 1).padStart(2, '0')}</p>
                <p className="text-[15px] font-semibold text-ink mb-1.5">{c.title}</p>
                <p className="text-[14px] text-inksoft leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* COMPETITIVE DIFFERENTIATORS */}
      {manual.differentiators?.length > 0 && (
        <section className="px-10 py-12 border-b border-hairline grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">07 — Diferenciadores competitivos</p>
            <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Lo que solo nosotros podemos decir.</p>
          </div>
          <div className="md:col-span-9 space-y-3">
            {manual.differentiators.map((d, i) => (
              <div key={i} className="flex gap-4 py-3 border-b border-hairline last:border-0">
                <p className="font-serif italic text-2xl text-accent shrink-0 w-10">{String(i + 1).padStart(2, '0')}</p>
                <p className="text-[14px] text-ink leading-relaxed pt-1">{d}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CONFIDENCE */}
      {manual.confidence?.length > 0 && (
        <section className="px-10 py-14 grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-inkmute mb-3">08 — Confianza por sección</p>
            <p className="font-serif italic text-[32px] leading-[1.05] text-ink">Qué tan seguro está el sistema.</p>
            <p className="text-[13px] text-inksoft leading-relaxed mt-4">Cada manual se autoevalúa. Si una sección baja del 80%, la IA repara antes de publicar.</p>
          </div>
          <div className="md:col-span-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {manual.confidence.map((c) => <V2Dial key={c.name} value={c.score} label={c.name} />)}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="px-10 py-6 border-t border-hairline bg-paper flex items-center justify-between gap-4 flex-wrap">
        <p className="text-[11px] mono text-inkmute">vectorizado · voyage-multilingual-2 · disponible para Creative Engine</p>
        <div className="flex items-center gap-2">
          <V2Button variant="secondary" size="sm" onClick={downloadJson}>
            <IconDownload size={13} /> Descargar JSON
          </V2Button>
          <V2Button variant="secondary" size="sm" onClick={copyJson}>
            <IconCopy size={13} /> Copiar JSON
          </V2Button>
          <V2Button variant="accent" size="sm" onClick={useInCreative}>
            Usar en Creative Engine <IconArrowRight size={13} />
          </V2Button>
        </div>
      </footer>
    </article>
  );
}

/**
 * Convert a real API BrandManual into the flat shape ManualSpread renders.
 */
export function adaptBrandManual(real, extra = {}) {
  const brand = V2_BRANDS.find((b) => b.id === real.meta.brand_id);
  return {
    id: `${real.meta.brand_id}-v${real.meta.version}`,
    brand_id: real.meta.brand_id,
    launch_id: real.meta.launch_id,
    category: brand?.category || real.meta.market || 'Alimentos',
    status: 'aprobado',
    cost: extra.cost ?? null,
    cache_hit: extra.cache_hit ?? null,
    created: real.meta.generated_at,
    concept: real.brand_essence.mission_statement,
    audience: real.positioning.target_segment,
    tone_hint: real.tone_of_voice.descriptors.join(', '),
    hue: brand?.hue || ['#E8001D', '#FFFFFF'],
    pillars: (real.content_pillars || []).slice(0, 3).map((p) => ({
      title: p.name,
      body: p.description,
    })),
    summary: {
      tagline: real.taglines[0] || '',
      positioning: real.positioning.statement,
      promise: real.brand_essence.values.slice(0, 2).join(' · '),
    },
    vocab: {
      preferred: real.vocabulary.preferred,
      forbidden: real.vocabulary.forbidden,
    },
    tone: {
      dos: real.tone_of_voice.dos,
      donts: real.tone_of_voice.donts,
    },
    cultural: (real.cultural_sensitivities || []).map((c) => ({
      title: c.topic,
      body: c.guidance,
      severity: c.severity,
    })),
    differentiators: real.competitive_differentiators || [],
    confidence: [
      { name: 'Esencia',        score: real.brand_essence._provenance?.confidence ?? 0.85 },
      { name: 'Posicionamiento', score: real.positioning._provenance?.confidence ?? 0.85 },
      { name: 'Tono de voz',     score: real.tone_of_voice._provenance?.confidence ?? 0.85 },
      { name: 'Vocabulario',     score: real.vocabulary._provenance?.confidence ?? 0.85 },
      { name: 'Visual',          score: real.visual_identity._provenance?.confidence ?? 0.85 },
    ],
  };
}
