/**
 * UI configuration data only.
 *
 * What's here:
 *   - Role / status / category / content-type ENUMS (label + color metadata)
 *   - V2_BRANDS: static registry of Alicorp brand IDENTITY (logo color, glyph)
 *     used by V2BrandMark when rendering any brand_id the user generates.
 *     This is NOT "your portfolio" — it's a colors/glyph lookup table.
 *
 * What was removed:
 *   - V2_MANUALS, V2_MANUAL_PRIMOR, V2_CONTENT, V2_AUDIT, V2_VISION_FINDINGS,
 *     V2_TRACES, V2_FEED, V2_AGENTS (full mock dataset)
 *
 * Real data comes exclusively from the backend API now.
 */
import type { UserRole } from '@/auth/AuthContext';

// ────────────────────────────────────────────────────────────
// Role display meta
// ────────────────────────────────────────────────────────────

export const V2_ROLE: Record<
  UserRole,
  { label: string; dot: string; soft: string }
> = {
  creator: {
    label: 'Creador',
    dot: '#E8001D',
    soft: 'bg-accentsoft text-accent ring-accentsoft',
  },
  approver_a: {
    label: 'Aprobador A',
    dot: '#6D3CB7',
    soft: 'bg-violetsoft text-violet ring-violetsoft',
  },
  approver_b: {
    label: 'Aprobador B',
    dot: '#2F6B3A',
    soft: 'bg-goodsoft text-good ring-goodsoft',
  },
};

// ────────────────────────────────────────────────────────────
// Alicorp brand identity registry
// (color / glyph lookup for rendering brand cards & marks —
//  NOT "your portfolio", just visual metadata.)
// ────────────────────────────────────────────────────────────

export interface BrandIdentity {
  id: string;
  category: string;
  hue: [string, string];
  glyph: string;
}

export const V2_BRANDS: BrandIdentity[] = [
  { id: 'PRIMOR',       category: 'Alimentos',          hue: ['#F4C24A', '#1F1B15'], glyph: 'P' },
  { id: 'BOLIVAR',      category: 'Limpieza del Hogar', hue: ['#1E66B8', '#FFFFFF'], glyph: 'B' },
  { id: 'NEGRITA',      category: 'Alimentos',          hue: ['#7A2018', '#F2D6A8'], glyph: 'N' },
  { id: 'DON VITTORIO', category: 'Alimentos',          hue: ['#2D6B3A', '#F5EFE0'], glyph: 'V' },
  { id: 'OPAL',         category: 'Limpieza del Hogar', hue: ['#8FB7D9', '#1B2A3F'], glyph: 'O' },
  { id: 'SAYÓN',        category: 'Bebidas',            hue: ['#C45A2C', '#FBE9D2'], glyph: 'S' },
  { id: 'GLACITAS',     category: 'Alimentos',          hue: ['#E4427C', '#FFF1E0'], glyph: 'G' },
  { id: 'FIELD',        category: 'Alimentos',          hue: ['#1F7A45', '#FFEFC2'], glyph: 'F' },
  { id: 'ANÚA',         category: 'Cuidado Personal',   hue: ['#5C3B8E', '#F3E8F8'], glyph: 'A' },
  { id: 'AJI-NO-MEN',   category: 'Alimentos',          hue: ['#D72431', '#F7E5C8'], glyph: 'A' },
  { id: 'MARSELLA',     category: 'Limpieza del Hogar', hue: ['#E8C547', '#1A1A1A'], glyph: 'M' },
];

// ────────────────────────────────────────────────────────────
// Enums used by forms / select inputs
// ────────────────────────────────────────────────────────────

export const V2_CATEGORIES = [
  'Alimentos',
  'Bebidas',
  'Cuidado Personal',
  'Limpieza del Hogar',
  'Otros',
];

export const V2_SUGGESTIONS = [
  'Relanzar Primor 1L para mamás NSE B/C, tono cálido y confiable',
  'Lanzamiento de Don Vittorio con quinua para hogares saludables',
  'Edición invierno de Negrita con menos azúcar, foco en tradición',
  'Bolivar fórmula concentrada — comunicación dirigida a NSE C/D',
];

export interface ContentTypeOption {
  id: string;
  label: string;
  sample: string;
  icon: string;
}

export const V2_CONTENT_TYPES: ContentTypeOption[] = [
  { id: 'product_description', label: 'Descripción de producto', sample: 'Para empaque, e-commerce y fichas técnicas.',    icon: 'IconFileText' },
  { id: 'social_post',         label: 'Post en redes sociales',  sample: 'Caption + visual hint para Instagram y Facebook.', icon: 'IconShare' },
  { id: 'email_subject',       label: 'Asuntos de email',        sample: '5 variaciones optimizadas por audiencia.',         icon: 'IconMail' },
  { id: 'tv_script',           label: 'Outline de spot TV',      sample: 'Estructura de 30 segundos con escenas y voz off.', icon: 'IconTv' },
  { id: 'press_release',       label: 'Nota de prensa',          sample: 'Comunicado en formato media-ready.',                icon: 'IconBook' },
];

// ────────────────────────────────────────────────────────────
// Status badges (used by V2Pill)
// ────────────────────────────────────────────────────────────

export const V2_STATUS: Record<string, { label: string; cls: string }> = {
  pendiente:            { label: 'Pendiente',     cls: 'bg-hairline/60 text-inksoft' },
  generando:            { label: 'Generando',     cls: 'bg-accentsoft text-accent' },
  evaluando:            { label: 'Evaluando',     cls: 'bg-violetsoft text-violet' },
  reparando:            { label: 'Reparando',     cls: 'bg-warnsoft text-warn' },
  aprobado:             { label: 'Aprobado',      cls: 'bg-goodsoft text-good' },
  fallido:              { label: 'Fallido',       cls: 'bg-badsoft text-bad' },
  pendiente_aprobacion: { label: 'En revisión',   cls: 'bg-warnsoft text-warn' },
  rechazado:            { label: 'Rechazado',     cls: 'bg-badsoft text-bad' },
  ok:                   { label: 'OK',            cls: 'bg-goodsoft text-good' },
  // backend JobStatus / ContentItem status
  complete:             { label: 'Completo',      cls: 'bg-goodsoft text-good' },
  running:              { label: 'Generando',     cls: 'bg-accentsoft text-accent' },
  failed:               { label: 'Fallido',       cls: 'bg-badsoft text-bad' },
  needs_human_review:   { label: 'Revisión humana', cls: 'bg-warnsoft text-warn' },
  incomplete_budget_hit:{ label: 'Sin presupuesto', cls: 'bg-badsoft text-bad' },
  draft:                { label: 'Borrador',      cls: 'bg-hairline/60 text-inksoft' },
  submitted:            { label: 'En revisión',   cls: 'bg-warnsoft text-warn' },
  approved:             { label: 'Aprobado',      cls: 'bg-goodsoft text-good' },
  rejected:             { label: 'Rechazado',     cls: 'bg-badsoft text-bad' },
};
