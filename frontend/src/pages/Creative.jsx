import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  IconArrowRight,
  IconBolt,
  IconBook,
  IconCheck,
  IconCopy,
  IconDownload,
  IconFileText,
  IconMail,
  IconShare,
  IconTv,
  IconWand,
} from '@/components/icons';
import {
  V2BrandMark,
  V2Button,
  V2Card,
  V2Input,
  V2Label,
  V2Pill,
  V2Textarea,
  V2Tooltip,
  cn,
  useV2Toast,
} from '@/components/ui';
import { V2_BRANDS, V2_CONTENT_TYPES } from '@/data';
import { useGenerateContent } from '@/hooks/useCreative';
import { useSubmitContentForReview } from '@/hooks/useGovernance';

const CONTENT_TYPE_ICONS = {
  product_description: IconFileText,
  social_post: IconShare,
  email_subject: IconMail,
  tv_script: IconTv,
  press_release: IconBook,
  tagline: IconBolt,
  ad_copy: IconWand,
};

// Map UI options to the backend's accepted content_type enum
const CONTENT_TYPE_BACKEND = {
  product_description: 'product_description',
  social_post: 'social_post',
  email_subject: 'email_subject',
  tv_script: 'ad_copy',
  press_release: 'product_description',
};

export default function CreativePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useV2Toast();
  const generateMutation = useGenerateContent();
  const submitMutation = useSubmitContentForReview();

  // Read the last-generated brand from session storage (set by Architect after a successful run).
  // If empty, show an empty state with CTA to /brand-dna.
  const initialBrand = (() => {
    try {
      return sessionStorage.getItem('cs.lastBrandId') || '';
    } catch {
      return '';
    }
  })();

  const [brandId, setBrandId] = useState(initialBrand);
  const [form, setForm] = useState({
    type: 'social_post',
    language: 'Español Perú',
    instructions: '',
  });
  const [output, setOutput] = useState('');
  const [contentId, setContentId] = useState(null);

  const upd = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Switching content type invalidates the current output — it was generated for a different format.
  const handleTypeChange = (newType) => {
    if (newType === form.type) return;
    upd('type', newType);
    setOutput('');
    setContentId(null);
    generateMutation.reset();
  };
  const selectedBrand = brandId
    ? V2_BRANDS.find((b) => b.id.toLowerCase() === brandId.toLowerCase().replace(/_/g, ' '))
    : null;

  const phase = generateMutation.isPending
    ? 'streaming'
    : generateMutation.isSuccess
      ? 'done'
      : 'idle';

  const generate = async () => {
    if (!brandId.trim()) {
      toast.push({ kind: 'error', title: 'Falta brand_id', body: 'Indica para qué marca generar el contenido.' });
      return;
    }
    setOutput('');
    setContentId(null);
    try {
      const item = await generateMutation.mutateAsync({
        brand_id: brandId.toLowerCase().replace(/\s+/g, '_'),
        content_type: CONTENT_TYPE_BACKEND[form.type] || 'social_post',
        prompt: form.instructions || `Genera ${form.type.replace('_', ' ')} para la marca ${brandId}.`,
        max_length: 600,
      });
      setOutput(item.generated_text);
      setContentId(item.content_id);
      toast.push({
        kind: 'success',
        title: 'Contenido generado',
        body: `${item.brand_context_used.length} chunks de manual consultados`,
      });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Generación fallida', body: err.message });
    }
  };

  const sendToReview = async () => {
    if (!contentId) return;
    try {
      await submitMutation.mutateAsync(contentId);
      toast.push({ kind: 'success', title: 'Enviado a revisión', body: 'Pasa a Aprobador A.' });
    } catch (err) {
      toast.push({ kind: 'error', title: 'No se pudo enviar', body: err.message });
    }
  };

  // No brand yet → empty state, prompt to create one first
  if (!initialBrand && !brandId.trim()) {
    return (
      <div>
        <section className="paper-warm border-b border-hairline">
          <div className="max-w-5xl mx-auto px-8 pt-12 pb-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Creative Engine</p>
            <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
              Contenido que respeta <span className="font-serif italic font-normal">cada regla</span> del manual.
            </h1>
          </div>
        </section>
        <section className="max-w-3xl mx-auto px-8 py-16">
          <V2Card className="text-center py-14 paper-warm">
            <div className="h-14 w-14 rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-5">
              <IconBook size={22} />
            </div>
            <h2 className="text-2xl font-semibold tracking-editorial text-ink">
              Necesitas un manual <span className="font-serif italic font-normal">primero.</span>
            </h2>
            <p className="text-inksoft text-[14px] leading-relaxed mt-3 max-w-md mx-auto">
              Creative Engine consulta el manual de marca (pgvector + voyage-multilingual-2) antes de redactar. Genera uno desde Brand DNA Architect.
            </p>
            <V2Button variant="accent" size="md" className="mt-6" onClick={() => navigate('/brand-dna')}>
              Ir a Brand DNA Architect <IconArrowRight size={14} />
            </V2Button>
            <p className="text-[11px] text-inkmute mt-6">
              o si ya tienes el <span className="mono">brand_id</span>, ingrésalo manualmente abajo.
            </p>
            <div className="mt-4 max-w-sm mx-auto flex gap-2">
              <V2Input
                placeholder="ej. quinua_snack_genz"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              />
              <V2Button
                variant="secondary"
                size="md"
                onClick={() => setBrandId(brandId.trim())}
                disabled={!brandId.trim()}
              >
                Usar
              </V2Button>
            </div>
          </V2Card>
        </section>
      </div>
    );
  }

  return (
    <div>
      <section className="paper-warm border-b border-hairline">
        <div className="max-w-5xl mx-auto px-8 pt-12 pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Creative Engine</p>
          <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
            Contenido que respeta <span className="font-serif italic font-normal">cada regla</span> del manual.
          </h1>
          <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-2xl">
            Antes de redactar, el motor consulta el RAG (pgvector + voyage-multilingual-2) y carga el manual de la marca. El vocabulario prohibido nunca llega al output.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-8 py-10 space-y-6">
        {/* Active brand banner */}
        <V2Card padded={false} className="overflow-hidden">
          <div className="flex items-center gap-5 p-5 border-b border-hairline">
            <V2BrandMark
              brand={selectedBrand || { hue: ['#1A1A1A', '#FFFFFF'], glyph: brandId[0]?.toUpperCase() || '?' }}
              size={56}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">Marca activa</p>
              <p className="text-lg font-semibold text-ink mt-0.5 mono">{brandId}</p>
              <p className="text-[12px] text-inksoft mt-0.5 inline-flex items-center gap-1.5">
                <IconBook size={11} /> RAG consulta el manual antes de cada generación
              </p>
            </div>
            <V2Button variant="ghost" size="sm" onClick={() => setBrandId('')}>
              Cambiar marca
            </V2Button>
          </div>

          {/* Content type picker */}
          <div className="p-5 grid grid-cols-1 md:grid-cols-5 gap-2">
            {V2_CONTENT_TYPES.map((t) => {
              const Icon = CONTENT_TYPE_ICONS[t.id] || IconFileText;
              const active = form.type === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTypeChange(t.id)}
                  className={cn(
                    'text-left rounded-2xl border p-4 transition-all duration-200 group',
                    active ? 'border-ink bg-paper' : 'border-hairline hover:border-hairlinestrong hover:bg-paper/50',
                  )}
                >
                  <Icon size={18} className={cn('mb-3 transition-colors', active ? 'text-ink' : 'text-inkmute group-hover:text-ink')} />
                  <p className={cn('text-[13px] font-semibold', active ? 'text-ink' : 'text-inksoft')}>{t.label}</p>
                  <p className="text-[11px] text-inkmute leading-snug mt-1">{t.sample}</p>
                </button>
              );
            })}
          </div>
        </V2Card>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-6">
          <div className="space-y-5">
            <V2Card>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-4">Parámetros</p>
              <div className="space-y-4">
                <div>
                  <V2Label className="mb-1.5">Idioma</V2Label>
                  <V2Input value={form.language} onChange={(e) => upd('language', e.target.value)} />
                </div>
                <div>
                  <V2Label className="mb-1.5">Instrucciones extras</V2Label>
                  <V2Textarea
                    rows={4}
                    value={form.instructions}
                    onChange={(e) => upd('instructions', e.target.value)}
                    placeholder="ej. enfatizar SKU 1L, sin mencionar competidores."
                  />
                </div>
                <V2Button variant="accent" className="w-full" size="lg" onClick={generate} disabled={phase === 'streaming'}>
                  {phase === 'streaming' ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-white border-r-transparent animate-spin"></span>
                      Escribiendo…
                    </>
                  ) : (
                    <>
                      <IconBolt size={14} /> Generar contenido
                    </>
                  )}
                </V2Button>
                <p className="text-[11px] text-inkmute leading-relaxed">
                  Claude Sonnet 4.6 con el manual de marca como contexto. Vocabulario prohibido se filtra automáticamente.
                </p>
              </div>
            </V2Card>
          </div>

          <V2Card padded={false} className="overflow-hidden min-h-[480px] flex flex-col">
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">Output</p>
                <p className="text-sm font-semibold text-ink">{V2_CONTENT_TYPES.find((t) => t.id === form.type)?.label}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {phase === 'streaming' && <V2Pill status="generando" />}
                {phase === 'done' && <V2Pill status="aprobado" />}
                <V2Tooltip label="Copiar">
                  <button
                    onClick={() => {
                      if (output) {
                        navigator.clipboard?.writeText(output);
                        toast.push({ kind: 'success', title: 'Copiado' });
                      }
                    }}
                    className="h-8 w-8 rounded-lg hover:bg-paper grid place-items-center text-inksoft"
                  >
                    <IconCopy size={14} />
                  </button>
                </V2Tooltip>
                <V2Tooltip label="Descargar">
                  <button className="h-8 w-8 rounded-lg hover:bg-paper grid place-items-center text-inksoft">
                    <IconDownload size={14} />
                  </button>
                </V2Tooltip>
              </div>
            </div>

            <div className="flex-1 p-7 overflow-y-auto">
              {phase === 'idle' && (
                <div className="h-full flex flex-col items-center justify-center text-center min-h-[360px]">
                  <div className="h-12 w-12 rounded-2xl bg-accentsoft text-accent grid place-items-center mb-4">
                    <IconWand size={20} />
                  </div>
                  <p className="text-sm font-semibold text-ink">Aún no hay output.</p>
                  <p className="text-[13px] text-inksoft mt-1 max-w-xs">
                    Elige tipo de contenido y dale a <span className="text-ink font-medium">Generar</span>.
                  </p>
                </div>
              )}
              {phase !== 'idle' && (
                <pre className="whitespace-pre-wrap font-sans text-[15px] leading-[1.75] text-ink">
                  {output}
                  {phase === 'streaming' && <span className="inline-block align-baseline ml-0.5 text-accent">▌</span>}
                </pre>
              )}
            </div>

            {phase === 'done' && user?.role === 'creator' && (
              <div className="px-6 py-4 border-t border-hairline flex items-center justify-between bg-paper">
                <p className="text-xs text-inkmute">
                  Pasa a <span className="font-medium text-ink">Aprobador A</span> para revisión editorial.
                </p>
                <V2Button variant="primary" size="md" onClick={sendToReview} disabled={submitMutation.isPending}>
                  <IconCheck size={13} /> Enviar a revisión
                </V2Button>
              </div>
            )}
          </V2Card>
        </div>
      </section>
    </div>
  );
}
