import React from 'react';
import {
  IconActivity,
  IconArrowUpRight,
  IconBolt,
  IconBook,
  IconDollar,
  IconEye,
  IconShield,
  IconType,
} from '@/components/icons';
import { V2Button, V2Card, useV2Reveal } from '@/components/ui';

const LANGFUSE_URL = import.meta.env.VITE_LANGFUSE_HOST || 'https://cloud.langfuse.com';

export default function ObservabilityPage() {
  const ref = useV2Reveal();

  return (
    <div ref={ref} className="reveal">
      <section className="paper-warm border-b border-hairline">
        <div className="max-w-5xl mx-auto px-8 pt-12 pb-10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent mb-3">Observabilidad</p>
          <h1 className="text-[44px] md:text-[56px] font-bold tracking-editorial leading-[1.0] text-ink max-w-3xl">
            Cada decisión de la IA
            <br />
            <span className="font-serif italic font-normal">queda auditable.</span>
          </h1>
          <p className="text-inksoft text-[15px] leading-relaxed mt-4 max-w-2xl">
            Cada llamada Claude se traza con cost, tokens y cache hit. Los spans se anidan automáticamente
            bajo <span className="mono">brand_dna_generate</span> usando Langfuse v4 + OpenInference Anthropic instrumentor.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-8 py-10 space-y-6">
        <V2Card className="flex items-center justify-between flex-wrap gap-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-accent text-white grid place-items-center">
              <IconActivity size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Langfuse v4 · OpenInference</p>
              <p className="text-[12px] text-inkmute">
                Los traces en vivo se ven en el dashboard de Langfuse. Cada <span className="mono">brand_dna_generate</span> contiene
                spans anidados de orchestrator → 5 workers → synthesizer → evaluator → repair.
              </p>
            </div>
          </div>
          <V2Button variant="primary" as="a" href={LANGFUSE_URL} target="_blank" rel="noreferrer">
            Abrir Langfuse <IconArrowUpRight size={13} />
          </V2Button>
        </V2Card>

        <V2Card className="text-center py-12 paper-warm">
          <div className="h-14 w-14 rounded-2xl bg-accentsoft text-accent grid place-items-center mx-auto mb-4">
            <IconActivity size={22} />
          </div>
          <h2 className="text-2xl font-semibold tracking-editorial text-ink">
            Los traces viven en <span className="font-serif italic font-normal">Langfuse.</span>
          </h2>
          <p className="text-[13px] text-inksoft mt-3 max-w-md mx-auto leading-relaxed">
            Cada Brand DNA generate, cada Creative generate y cada Vision Audit que ejecutes desde Content Suite genera
            un trace anidado en Langfuse con costo, tokens, cache hit y judge scores. Abrí el dashboard para verlos en vivo.
          </p>
          <p className="text-[11px] mono text-inkmute mt-5">
            host: {LANGFUSE_URL}
          </p>
        </V2Card>

        <V2Card>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-inkmute mb-4">Qué queda registrado en cada interacción</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { icon: <IconBook size={14} />,   t: 'Contexto del RAG',     d: 'Qué chunks se recuperaron del manual y su similitud coseno.' },
              { icon: <IconType size={14} />,   t: 'Prompt enviado',       d: 'System + user + tool definitions, con cache_control para reuso.' },
              { icon: <IconBolt size={14} />,   t: 'Respuesta del modelo', d: 'Output crudo, stop_reason y tool calls realizadas.' },
              { icon: <IconEye size={14} />,    t: 'Auditoría multimodal', d: 'Imagen analizada, regiones detectadas y findings con confianza.' },
              { icon: <IconDollar size={14} />, t: 'Costo y latencia',     d: 'Tokens in/out, $ por modelo, latencia por etapa.' },
              { icon: <IconShield size={14} />, t: 'Decisión humana',      d: 'Quién aprobó/rechazó, motivos y tiempo de revisión.' },
            ].map((it, i) => (
              <div key={i} className="flex gap-3 p-4 rounded-2xl border border-hairline">
                <span className="h-8 w-8 rounded-lg bg-paper text-inksoft grid place-items-center shrink-0">{it.icon}</span>
                <div>
                  <p className="text-[13px] font-semibold text-ink">{it.t}</p>
                  <p className="text-[12px] text-inksoft leading-relaxed mt-0.5">{it.d}</p>
                </div>
              </div>
            ))}
          </div>
        </V2Card>
      </section>
    </div>
  );
}
