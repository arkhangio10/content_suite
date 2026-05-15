import React, { useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconCloudUp,
  IconEye,
  IconImage,
  IconShield,
  IconX,
} from '@/components/icons';
import {
  V2BrandMark,
  V2Button,
  V2Card,
  V2Input,
  V2Label,
  V2Pill,
  V2Textarea,
  cn,
  useV2Reveal,
  useV2Toast,
} from '@/components/ui';
import { V2_BRANDS } from '@/data';
import {
  useContentFull,
  useImageAudit,
  usePendingReviews,
  useRecordAuditDecision,
  useReviewContent,
} from '@/hooks/useGovernance';
import { useListBrandManuals } from '@/hooks/useBrandDna';

export default function GovernancePage() {
  const { user } = useAuth();

  if (!user || user.role === 'creator') {
    return (
      <div className="px-8 py-24 max-w-2xl mx-auto text-center animate-fade-up">
        <div className="h-14 w-14 rounded-2xl bg-warnsoft text-warn grid place-items-center mx-auto mb-4">
          <IconShield size={22} />
        </div>
        <h2 className="text-2xl font-bold tracking-editorial text-ink">Gobernanza es solo para aprobadores.</h2>
        <p className="text-sm text-inksoft mt-2 max-w-md mx-auto">
          Tu rol actual no tiene acceso a esta página. Habla con tu administrador si crees que deberías tenerlo.
        </p>
      </div>
    );
  }

  return (
    <div>
      <section className="paper-warm border-b border-hairline">
        <div className="max-w-6xl mx-auto px-8 pt-12 pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Gobernanza &amp; Auditoría</p>
          <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
            {user.role === 'approver_a' ? (
              <>
                Aprueba con <span className="font-serif italic font-normal">criterio,</span>
                <br />
                no con corazonada.
              </>
            ) : (
              <>
                Cada visual auditado
                <br />
                <span className="font-serif italic font-normal">contra la regla escrita.</span>
              </>
            )}
          </h1>
          <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-2xl">
            {user.role === 'approver_a'
              ? 'Cada pieza llega con el manual de marca al lado. Aprueba, rechaza con razón, y todo queda en el ledger.'
              : 'Sube empaque, OOH o KV. Claude Sonnet 4.6 Vision compara contra el manual escrito y devuelve findings concretos.'}
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-8 py-10">
        {user.role === 'approver_a' ? <ApproverAQueue /> : <VisionAudit />}
      </section>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Approver A — REAL queue fetched from /governance/pending
// ────────────────────────────────────────────────────────────

function ApproverAQueue() {
  const ref = useV2Reveal();
  const toast = useV2Toast();
  const pendingQuery = usePendingReviews();
  const reviewMutation = useReviewContent();
  const [openContentId, setOpenContentId] = useState(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');

  const queue = pendingQuery.data?.pending || [];
  const open = queue.find((q) => q.content_id === openContentId);
  const fullQuery = useContentFull(openContentId);
  const full = fullQuery.data;

  const close = () => {
    setOpenContentId(null);
    setRejectMode(false);
    setRejectText('');
  };

  const handleDecision = async (decision, comment = '') => {
    if (!full?.review_id) return;
    try {
      await reviewMutation.mutateAsync({
        reviewId: full.review_id,
        decision,
        comment,
      });
      toast.push({
        kind: decision === 'approve' ? 'success' : 'info',
        title: decision === 'approve' ? 'Aprobado' : decision === 'reject' ? 'Rechazado' : 'Cambios solicitados',
        body: `${full.brand_id} · ${full.content_type}`,
      });
      close();
      pendingQuery.refetch();
    } catch (err) {
      toast.push({ kind: 'error', title: 'No se pudo procesar', body: err.message });
    }
  };

  if (pendingQuery.isLoading) {
    return (
      <div className="text-center py-12 text-inkmute text-sm">Cargando cola de aprobación…</div>
    );
  }

  return (
    <div ref={ref} className="reveal space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-2">Cola de aprobación · texto</p>
          <h2 className="text-2xl font-semibold tracking-editorial text-ink">
            {queue.length} <span className="font-serif italic font-normal">
              {queue.length === 1 ? 'pieza pendiente.' : 'piezas pendientes.'}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-warnsoft text-warn ring-1 ring-warn/20 px-3 py-1 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse"></span>
            polling cada 5s
          </span>
        </div>
      </div>

      {queue.length === 0 ? (
        <V2Card className="text-center py-14 paper-warm">
          <div className="h-14 w-14 rounded-2xl bg-goodsoft text-good grid place-items-center mx-auto mb-4">
            <IconCheck size={22} />
          </div>
          <p className="text-2xl font-semibold tracking-editorial text-ink">
            Estás <span className="font-serif italic font-normal">al día.</span>
          </p>
          <p className="text-[14px] text-inksoft mt-2 max-w-md mx-auto leading-relaxed">
            Cuando un creador envíe contenido a revisión, aparecerá acá.
          </p>
        </V2Card>
      ) : (
        <div className="space-y-3">
          {queue.map((item) => {
            const b = V2_BRANDS.find((x) => x.id.toLowerCase() === item.brand_id.toLowerCase());
            return (
              <V2Card
                key={item.review_id}
                padded={false}
                className="hover:border-hairlinestrong hover:shadow-md transition-all cursor-pointer overflow-hidden"
              >
                <button onClick={() => setOpenContentId(item.content_id)} className="w-full flex items-stretch text-left">
                  <div className="shrink-0 paper-warm px-6 py-5 flex flex-col items-center justify-center gap-2 border-r border-hairline w-[120px]">
                    <V2BrandMark
                      brand={b || { hue: ['#1A1A1A', '#FFFFFF'], glyph: item.brand_id[0]?.toUpperCase() || '?' }}
                      size={40}
                    />
                    <span className="text-[10px] mono text-inkmute">{item.brand_id}</span>
                  </div>
                  <div className="flex-1 min-w-0 p-5">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">
                        {item.content_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-hairlinestrong">·</span>
                      <span className="text-[10px] mono text-inkmute">{item.content_id.slice(0, 8)}</span>
                      <V2Pill status="pendiente_aprobacion" />
                    </div>
                    <p className="font-serif italic text-[18px] leading-snug text-ink">
                      "{item.excerpt}"
                    </p>
                    <p className="text-[11px] text-inkmute mt-2">
                      Prompt: {item.prompt.slice(0, 80)}{item.prompt.length > 80 ? '…' : ''}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center pr-6">
                    <V2Button variant="secondary" size="sm">Leer <IconArrowRight size={13} /></V2Button>
                  </div>
                </button>
              </V2Card>
            );
          })}
        </div>
      )}

      {/* Review drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 animate-fade-up" onClick={close}></div>
          <div className="w-full max-w-[760px] bg-white shadow-2xl flex flex-col animate-slide-in h-screen">
            <div className="h-16 shrink-0 border-b border-hairline px-6 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <V2BrandMark
                  brand={V2_BRANDS.find((b) => b.id.toLowerCase() === open.brand_id.toLowerCase()) ||
                    { hue: ['#1A1A1A', '#FFFFFF'], glyph: open.brand_id[0]?.toUpperCase() }}
                  size={36}
                />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">Revisión editorial</p>
                  <p className="text-sm font-semibold text-ink truncate mono">{open.brand_id} · {open.content_type}</p>
                </div>
              </div>
              <button onClick={close} className="h-9 w-9 rounded-full hover:bg-paper grid place-items-center text-inksoft">
                <IconX size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Pieza generada — sección principal, grande */}
              <div className="px-6 py-7 border-b border-hairline">
                <div className="flex items-center justify-between mb-4">
                  <V2Label>Pieza generada</V2Label>
                  <span className="text-[11px] mono text-inkmute">
                    {full?.char_count ? `${full.char_count} caracteres` : ''}
                  </span>
                </div>
                {fullQuery.isLoading ? (
                  <p className="text-sm text-inkmute">Cargando contenido completo…</p>
                ) : (
                  <div className="rounded-xl border border-hairline bg-white px-5 py-4 max-h-[40vh] overflow-y-auto">
                    <p className="whitespace-pre-wrap font-sans text-[15px] leading-[1.75] text-ink">
                      {full?.generated_text || open.excerpt}
                    </p>
                  </div>
                )}
              </div>

              {/* Manual de marca — visión rápida de las reglas */}
              {full?.manual_summary && (
                <div className="px-6 py-6 border-b border-hairline paper-warm">
                  <V2Label className="mb-3">Manual de marca consultado</V2Label>
                  {full.manual_summary.core_idea && (
                    <p className="font-serif italic text-[17px] leading-snug text-ink mb-1">
                      "{full.manual_summary.core_idea}"
                    </p>
                  )}
                  {full.manual_summary.tagline && (
                    <p className="text-[12px] mono text-inkmute mb-3">
                      tagline: {full.manual_summary.tagline}
                    </p>
                  )}
                  {full.manual_summary.tone_descriptors?.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute mr-1">Tono:</span>
                      {full.manual_summary.tone_descriptors.map((t, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-white border border-hairline px-2.5 py-0.5 text-[11px] text-inksoft">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    {full.manual_summary.vocabulary_preferred?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-good mb-1.5">Vocabulario preferido</p>
                        <div className="flex flex-wrap gap-1">
                          {full.manual_summary.vocabulary_preferred.map((w, i) => (
                            <span key={i} className="inline-flex items-center rounded-md bg-goodsoft text-good px-2 py-0.5 text-[11px]">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {full.manual_summary.vocabulary_forbidden?.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-bad mb-1.5">Vocabulario prohibido</p>
                        <div className="flex flex-wrap gap-1">
                          {full.manual_summary.vocabulary_forbidden.map((w, i) => (
                            <span key={i} className="inline-flex items-center rounded-md bg-badsoft text-bad px-2 py-0.5 text-[11px] line-through">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Contexto RAG usado por la generación */}
              {full?.brand_context_used?.length > 0 && (
                <div className="px-6 py-6 border-b border-hairline">
                  <V2Label className="mb-3">Contexto RAG inyectado al prompt</V2Label>
                  <ul className="space-y-2">
                    {full.brand_context_used.map((chunk, i) => (
                      <li key={i} className="rounded-lg border border-hairline bg-white px-3 py-2 text-[12px] text-inksoft leading-relaxed">
                        <span className="mono text-[10px] text-inkmute mr-2">#{i + 1}</span>
                        {chunk}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Prompt original */}
              <div className="px-6 py-5 paper-warm">
                <V2Label className="mb-2">Prompt del creador</V2Label>
                <p className="text-[13px] text-inksoft leading-relaxed">"{open.prompt}"</p>
              </div>
            </div>

            <div className="border-t border-hairline p-5 bg-paper">
              {!rejectMode ? (
                <div className="grid grid-cols-2 gap-3">
                  <V2Button
                    variant="secondary"
                    size="lg"
                    onClick={() => setRejectMode(true)}
                    className="border-bad/20 text-bad hover:bg-badsoft/40"
                  >
                    <IconX size={15} /> Rechazar
                  </V2Button>
                  <V2Button
                    variant="success"
                    size="lg"
                    onClick={() => handleDecision('approve')}
                    disabled={reviewMutation.isPending}
                  >
                    <IconCheck size={15} /> Aprobar
                  </V2Button>
                </div>
              ) : (
                <div className="space-y-3 animate-fade-up">
                  <V2Label>Motivo del rechazo</V2Label>
                  <V2Textarea
                    rows={3}
                    value={rejectText}
                    onChange={(e) => setRejectText(e.target.value)}
                    placeholder="Sé específico — esto regresa al creador."
                  />
                  <div className="flex items-center justify-between gap-3">
                    <V2Button variant="ghost" size="sm" onClick={() => setRejectMode(false)}>Cancelar</V2Button>
                    <V2Button
                      variant="danger"
                      size="md"
                      onClick={() => handleDecision('reject', rejectText)}
                      disabled={!rejectText.trim() || reviewMutation.isPending}
                    >
                      Devolver al creador
                    </V2Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Approver B — Vision audit (real API, no mocks)
// ────────────────────────────────────────────────────────────

function VisionAudit() {
  const ref = useV2Reveal();
  const toast = useV2Toast();
  const auditMutation = useImageAudit();
  const decisionMutation = useRecordAuditDecision();
  const manualsQuery = useListBrandManuals();
  const availableBrands = (manualsQuery.data?.manuals || []).filter((m) => m.status === 'complete');
  const [file, setFile] = useState(null);
  const [brandId, setBrandId] = useState(() => {
    try { return sessionStorage.getItem('cs.lastBrandId') || ''; } catch { return ''; }
  });
  const fileInput = useRef(null);
  const [drag, setDrag] = useState(false);
  const [auditResult, setAuditResult] = useState(null);

  const onPick = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFile({ name: f.name, size: f.size, dataUrl: reader.result, raw: f });
      setAuditResult(null);
      setDecisionDone(null);
      setDecisionMode(null);
      setDecisionNote('');
    };
    reader.readAsDataURL(f);
  };

  const run = async () => {
    if (!file?.raw) return;
    if (!brandId.trim()) {
      toast.push({ kind: 'error', title: 'Falta brand_id', body: 'Indica para qué marca evaluar la imagen.' });
      return;
    }
    try {
      const result = await auditMutation.mutateAsync({
        brandId: brandId.toLowerCase().replace(/\s+/g, '_'),
        file: file.raw,
      });
      setAuditResult(result);
      toast.push({
        kind: result.passed ? 'success' : 'error',
        title: result.passed ? 'Auditoría APROBADA' : 'Auditoría necesita ajustes',
        body: `${result.findings.length} findings · score ${result.overall_score.toFixed(2)}`,
      });
    } catch (err) {
      toast.push({ kind: 'error', title: 'Error en la auditoría', body: err.message });
    }
  };

  const [decisionMode, setDecisionMode] = useState(null); // null | 'approve' | 'changes'
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionDone, setDecisionDone] = useState(null); // null | 'approved' | 'changes_requested'

  const phase = auditMutation.isPending ? 'scanning' : auditResult ? 'done' : file ? 'uploaded' : 'idle';
  const verdict = auditResult
    ? auditResult.passed
      ? 'APROBADO'
      : auditResult.findings.some((f) => f.severity === 'critical')
        ? 'NECESITA AJUSTES'
        : 'REVISAR'
    : null;
  const verdictMeta = {
    APROBADO: { cls: 'bg-goodsoft text-good ring-good/20', dot: 'bg-good' },
    'NECESITA AJUSTES': { cls: 'bg-badsoft text-bad ring-bad/20', dot: 'bg-bad' },
    REVISAR: { cls: 'bg-warnsoft text-warn ring-warn/20', dot: 'bg-warn' },
  }[verdict] || {};

  return (
    <div ref={ref} className="reveal grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-6">
      <V2Card className="self-start">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-4">Configurar auditoría</p>

        {!file && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onPick(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              'cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all',
              drag ? 'border-accent bg-accentsoft' : 'border-hairlinestrong hover:border-inkmute bg-paper/40',
            )}
          >
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => onPick(e.target.files?.[0])}
            />
            <div className="h-12 w-12 rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-3">
              <IconCloudUp size={20} />
            </div>
            <p className="text-sm font-semibold text-ink">Suelta una imagen aquí</p>
            <p className="text-[12px] text-inkmute mt-1">PNG, JPG, WEBP hasta 5MB · empaque, KV, OOH</p>
          </div>
        )}

        {file && (
          <div className="rounded-xl border border-hairline bg-paper p-3 flex items-center gap-3">
            <img src={file.dataUrl} alt={file.name} className="h-14 w-14 object-cover rounded-lg border border-hairline" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-ink truncate">{file.name}</p>
              <p className="text-[11px] text-inkmute">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button
              onClick={() => {
                setFile(null);
                setAuditResult(null);
              }}
              className="h-8 w-8 rounded-full hover:bg-white grid place-items-center text-inksoft"
            >
              <IconX size={13} />
            </button>
          </div>
        )}

        <div className="mt-5 space-y-4">
          <div>
            <V2Label className="mb-1.5">Manual de marca</V2Label>
            {availableBrands.length > 0 ? (
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-xl border border-hairline bg-white px-3 py-2.5 text-[13px] text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
              >
                <option value="">— Selecciona una marca —</option>
                {availableBrands.map((m) => (
                  <option key={m.brand_id} value={m.brand_id}>
                    {m.brand_id}
                    {m.judge_scores?.overall ? ` · score ${Number(m.judge_scores.overall).toFixed(2)}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <V2Input
                className="mono"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                placeholder="ej. quinua_snack_genz"
              />
            )}
            <p className="text-[11px] text-inkmute mt-1.5 leading-relaxed">
              {availableBrands.length > 0
                ? `${availableBrands.length} manual${availableBrands.length > 1 ? 'es' : ''} disponible${availableBrands.length > 1 ? 's' : ''} · el contexto se inyecta antes de auditar.`
                : 'Genera un manual en Brand DNA Architect para habilitarlo aquí.'}
            </p>
          </div>
          <V2Button variant="accent" className="w-full" size="lg" onClick={run} disabled={!file || phase === 'scanning'}>
            {phase === 'scanning' ? (
              <>
                <span className="h-3 w-3 rounded-full border-2 border-white border-r-transparent animate-spin"></span>
                Escaneando…
              </>
            ) : (
              <>
                <IconEye size={15} /> Correr auditoría
              </>
            )}
          </V2Button>
        </div>

        {auditResult && (
          <div className="mt-5 rounded-2xl border border-hairline overflow-hidden">
            <div className="bg-paper px-4 py-3 border-b border-hairline">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute">Score global</p>
              <p className="font-serif italic text-3xl text-ink mt-1">{Math.round(auditResult.overall_score * 100)}%</p>
            </div>
            <ul className="divide-y divide-hairline">
              {auditResult.findings.map((f, i) => {
                const meta = {
                  pass: { icon: <IconCheck size={12} />, cls: 'bg-goodsoft text-good' },
                  warning: { icon: <IconAlert size={12} />, cls: 'bg-warnsoft text-warn' },
                  fail: { icon: <IconX size={12} />, cls: 'bg-badsoft text-bad' },
                }[f.status] || { icon: <IconAlert size={12} />, cls: 'bg-hairline text-inksoft' };
                return (
                  <li key={i} className="flex items-start gap-3 p-3">
                    <span className={cn('h-6 w-6 rounded-full grid place-items-center shrink-0', meta.cls)}>{meta.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink">{f.dimension}</p>
                      <p className="text-[11px] text-inksoft leading-snug mt-0.5">{f.observation}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {auditResult.recommendations?.length > 0 && (
              <div className="bg-paperwarm border-t border-hairline px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-inkmute mb-2">Recomendaciones</p>
                <ul className="text-[12px] text-inksoft space-y-1 list-disc list-inside">
                  {auditResult.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </V2Card>

      <V2Card padded={false} className="overflow-hidden">
        <div className="px-6 py-4 border-b border-hairline flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute">Resultado visual</p>
            <p className="text-sm font-semibold text-ink">
              {phase === 'idle' && 'Esperando imagen'}
              {phase === 'uploaded' && 'Listo para auditar'}
              {phase === 'scanning' && 'Analizando con Claude Sonnet 4.6 Vision…'}
              {phase === 'done' && 'Análisis completo'}
            </p>
          </div>
          {verdict && (
            <span className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1', verdictMeta.cls)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', verdictMeta.dot)}></span>
              {verdict}
            </span>
          )}
        </div>

        <div className="relative aspect-[5/3] bg-paper">
          {!file && (
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="h-12 w-12 rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-3">
                  <IconImage size={20} />
                </div>
                <p className="text-sm font-semibold text-ink">Aún no hay imagen.</p>
                <p className="text-[13px] text-inksoft mt-1">Sube una pieza para verla auditada aquí.</p>
              </div>
            </div>
          )}
          {file && (
            <div className="absolute inset-0">
              <img src={file.dataUrl} alt={file.name} className="w-full h-full object-contain p-6" />
              {phase === 'scanning' && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {/* Dark overlay */}
                  <div className="absolute inset-0 bg-black/30" />

                  {/* Subtle grid */}
                  <div className="absolute inset-0 opacity-[0.06]" style={{
                    backgroundImage: 'linear-gradient(rgba(227,6,19,1) 1px,transparent 1px),linear-gradient(90deg,rgba(227,6,19,1) 1px,transparent 1px)',
                    backgroundSize: '48px 48px',
                  }} />

                  {/* Corner brackets */}
                  <div className="absolute top-5 left-5 w-7 h-7 border-t-[3px] border-l-[3px] border-accent rounded-tl" style={{animation:'cs-corner 1.6s ease-in-out infinite'}} />
                  <div className="absolute top-5 right-5 w-7 h-7 border-t-[3px] border-r-[3px] border-accent rounded-tr" style={{animation:'cs-corner 1.6s ease-in-out infinite 0.2s'}} />
                  <div className="absolute bottom-16 left-5 w-7 h-7 border-b-[3px] border-l-[3px] border-accent rounded-bl" style={{animation:'cs-corner 1.6s ease-in-out infinite 0.4s'}} />
                  <div className="absolute bottom-16 right-5 w-7 h-7 border-b-[3px] border-r-[3px] border-accent rounded-br" style={{animation:'cs-corner 1.6s ease-in-out infinite 0.6s'}} />

                  {/* Scan line with glow */}
                  <div className="absolute left-5 right-5 h-[2px] rounded-full" style={{
                    background: 'linear-gradient(to right,transparent 0%,#E30613 25%,#E30613 75%,transparent 100%)',
                    boxShadow: '0 0 8px 4px rgba(227,6,19,0.45),0 0 22px 8px rgba(227,6,19,0.15)',
                    animation: 'cs-scan 2.4s ease-in-out infinite',
                  }} />

                  {/* Status badge */}
                  <div className="absolute bottom-5 left-0 right-0 flex justify-center">
                    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm text-white px-4 py-2 rounded-full">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                      <span className="text-[11px] font-mono tracking-widest">CLAUDE VISION · ANALIZANDO</span>
                    </div>
                  </div>

                  <style>{`
                    @keyframes cs-scan {
                      0%   { top: 10%; opacity: 0; }
                      6%   { opacity: 1; }
                      44%  { top: 82%; opacity: 1; }
                      50%  { top: 82%; opacity: 0; }
                      100% { top: 10%; opacity: 0; }
                    }
                    @keyframes cs-corner {
                      0%,100% { opacity: 1; }
                      50%     { opacity: 0.25; }
                    }
                  `}</style>
                </div>
              )}
            </div>
          )}
        </div>

        {phase === 'done' && !decisionDone && (
          <div className="border-t border-hairline px-6 py-4 bg-paper">
            {!decisionMode ? (
              <div className="flex items-center justify-end gap-3">
                <V2Button variant="secondary" size="md" onClick={() => setDecisionMode('changes')}
                  className="border-bad/20 text-bad hover:bg-badsoft/40">
                  <IconX size={14} /> Pedir cambios
                </V2Button>
                <V2Button variant="success" size="md" onClick={() => setDecisionMode('approve')}>
                  <IconCheck size={14} /> Aprobar con notas
                </V2Button>
              </div>
            ) : (
              <div className="space-y-3 animate-fade-up">
                <V2Label>
                  {decisionMode === 'approve' ? 'Notas para el equipo creativo' : 'Motivo de los cambios solicitados'}
                </V2Label>
                <V2Textarea
                  rows={2}
                  value={decisionNote}
                  onChange={(e) => setDecisionNote(e.target.value)}
                  placeholder={decisionMode === 'approve'
                    ? 'Indicaciones adicionales al creador…'
                    : 'Especifica qué ajustar en la imagen…'}
                />
                <div className="flex items-center justify-between gap-3">
                  <V2Button variant="ghost" size="sm"
                    onClick={() => { setDecisionMode(null); setDecisionNote(''); }}>
                    Cancelar
                  </V2Button>
                  <V2Button
                    variant={decisionMode === 'approve' ? 'success' : 'danger'}
                    size="md"
                    onClick={async () => {
                      const apiDecision = decisionMode === 'approve' ? 'approve' : 'changes_requested';
                      const done = decisionMode === 'approve' ? 'approved' : 'changes_requested';
                      // Persist to audit_logs (best-effort — never block the UI)
                      if (auditResult?.audit_id) {
                        decisionMutation.mutate({
                          auditId: auditResult.audit_id,
                          decision: apiDecision,
                          note: decisionNote.trim(),
                        });
                      }
                      setDecisionDone(done);
                      setDecisionMode(null);
                      toast.push({
                        kind: decisionMode === 'approve' ? 'success' : 'info',
                        title: decisionMode === 'approve' ? 'Auditoría aprobada' : 'Cambios solicitados',
                        body: decisionNote.trim() || (decisionMode === 'approve'
                          ? 'Hallazgos enviados al equipo creativo.'
                          : 'El equipo creativo será notificado.'),
                      });
                    }}
                  >
                    {decisionMode === 'approve'
                      ? <><IconCheck size={14} /> Confirmar aprobación</>
                      : <><IconX size={14} /> Solicitar cambios</>}
                  </V2Button>
                </div>
              </div>
            )}
          </div>
        )}
        {phase === 'done' && decisionDone && (
          <div className="border-t border-hairline px-6 py-4 bg-paper flex items-center justify-center">
            {decisionDone === 'approved' ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-goodsoft text-good px-4 py-2 text-sm font-semibold ring-1 ring-good/20">
                <IconCheck size={14} /> Auditoría confirmada — hallazgos enviados
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-warnsoft text-warn px-4 py-2 text-sm font-semibold ring-1 ring-warn/20">
                <IconAlert size={14} /> Cambios solicitados al equipo creativo
              </span>
            )}
          </div>
        )}
      </V2Card>
    </div>
  );
}
