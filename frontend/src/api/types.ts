/**
 * Frontend types mirroring backend Pydantic schemas.
 * Source of truth: v1/backend/app/modules/brand_dna/schemas.py
 * Keep in sync manually (no codegen — small surface area).
 */

// ────────────────────────────────────────────────────────────
// Common
// ────────────────────────────────────────────────────────────

export type AgentRole =
  | 'competitive_scan'
  | 'audience_research'
  | 'trend_analysis'
  | 'cultural_context'
  | 'positioning_analysis';

export interface Provenance {
  finding_ids: string[];
  confidence: number;
  uncertainty?: boolean;
  human_reviewed?: boolean;
}

// ────────────────────────────────────────────────────────────
// Brief extraction (AI-powered prefill, separate from generation)
// ────────────────────────────────────────────────────────────

export interface ExtractedBrief {
  brand_id: string;
  category: string;
  audience: string;
  tone_hint: string;
  concept: string;
  constraints: string[];
  launch_id: string;
  confidence: number;
}

// ────────────────────────────────────────────────────────────
// ProductBrief — input to Module I
// ────────────────────────────────────────────────────────────

export interface ProductBrief {
  launch_id: string;
  brand_id: string;
  category: string;
  product_concept: string;
  target_audience: string;
  tone_hint?: string;
  market: string;
  business_constraints?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  requested_by?: string;
}

// ────────────────────────────────────────────────────────────
// BrandManual (Module I output)
// ────────────────────────────────────────────────────────────

export interface BrandManualMeta {
  brand_id: string;
  product_name: string;
  version: number;
  market: string;
  language: string;
  launch_id: string;
  generated_at: string;
  source_brief_id: string | null;
  partial_evidence: boolean;
}

export interface BrandEssence {
  core_idea: string;
  values: string[];
  mission_statement: string;
  _provenance?: Provenance;
}

export interface Positioning {
  statement: string;
  target_segment: string;
  unique_value_prop: string;
  reasons_to_believe: string[];
  _provenance?: Provenance;
}

export interface Persona {
  name: string;
  age_range: string;
  ses_bracket: 'A' | 'B' | 'C1' | 'C2' | 'D' | 'E';
  region: string;
  occupation: string;
  lifestyle: string;
  pain_points: string[];
  aspirations: string[];
  consumption_occasions: string[];
  trust_signals: string[];
  native_phrases: string[];
  _provenance?: Provenance;
}

export interface ToneOfVoice {
  descriptors: string[];
  dos: string[];
  donts: string[];
  _provenance?: Provenance;
}

export interface Vocabulary {
  preferred: string[];
  forbidden: string[];
  _provenance?: Provenance;
}

export interface ContentPillar {
  name: string;
  description: string;
  example_headlines: string[];
  _provenance?: Provenance;
}

export interface CulturalNote {
  topic: string;
  guidance: string;
  severity: 'avoid' | 'caution' | 'note';
}

export interface VisualIdentity {
  color_palette: { name: string; hex: string; usage?: string }[];
  typography_style: string;
  imagery_style: string;
  _provenance?: Provenance;
}

export interface BrandManual {
  meta: BrandManualMeta;
  brand_essence: BrandEssence;
  positioning: Positioning;
  personas: Persona[];
  tone_of_voice: ToneOfVoice;
  vocabulary: Vocabulary;
  content_pillars: ContentPillar[];
  taglines: string[];
  key_messages: string[];
  competitive_differentiators: string[];
  cultural_sensitivities: CulturalNote[];
  visual_identity: VisualIdentity;
}

// ────────────────────────────────────────────────────────────
// Judge result
// ────────────────────────────────────────────────────────────

export interface JudgeScores {
  internal_consistency: number;
  factual_grounding: number;
  cultural_fit_peru: number;
  completeness: number;
  overall: number;
}

export interface JudgeViolation {
  dimension: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  suggested_fix?: string;
}

export interface JudgeResult {
  scores: JudgeScores;
  violations: JudgeViolation[];
  verdict: 'pass' | 'repair' | 'reject';
  reasoning: string;
}

// ────────────────────────────────────────────────────────────
// Job / pipeline status
// ────────────────────────────────────────────────────────────

export type JobStatus =
  | 'running'
  | 'complete'
  | 'needs_human_review'
  | 'incomplete_budget_hit'
  | 'failed';

export interface BudgetSummary {
  trace_id: string;
  spent_usd: number;
  ceiling_usd: number;
  remaining_usd: number;
  calls: number;
  cache_hit_rate: number;
}

export type PipelinePhase =
  | 'planning'
  | 'researching'
  | 'synthesizing'
  | 'evaluating'
  | 'repairing'
  | 'done';

export interface JobResponse {
  job_id: string;
  status: JobStatus;
  brand_id: string;
  phase?: PipelinePhase;
  started_at: string;
  completed_at: string | null;
  budget: BudgetSummary | null;
  judge_scores: JudgeScores | null;
  error: string | null;
  manual?: BrandManual;
}

export interface GenerateJobResponse {
  job_id: string;
  status: 'running';
  brand_id: string;
  trace_id: string;
}

// ────────────────────────────────────────────────────────────
// Creative Engine (Module II)
// ────────────────────────────────────────────────────────────

export type ContentType =
  | 'social_post'
  | 'tagline'
  | 'product_description'
  | 'email_subject'
  | 'ad_copy';

export interface GenerateContentRequest {
  brand_id: string;
  content_type: ContentType;
  prompt: string;
  platform?: string;
  max_length?: number;
}

export interface ContentItem {
  content_id: string;
  brand_id: string;
  content_type: string;
  prompt: string;
  generated_text: string;
  brand_context_used: string[];
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export interface ManualListItem {
  job_id: string;
  brand_id: string;
  status: JobStatus | string;
  phase?: PipelinePhase;
  started_at: string;
  completed_at: string | null;
  judge_scores: JudgeScores | null;
  budget: BudgetSummary | null;
  core_idea: string | null;
  tagline: string | null;
  version: number;
  language: string;
  creator_id: string;
}

export interface PendingReviewItem {
  review_id: string;
  content_id: string;
  brand_id: string;
  content_type: string;
  prompt: string;
  excerpt: string;
  submitted_by: string;
  status: string;
}

export interface ContentFull {
  content_id: string;
  brand_id: string;
  content_type: string;
  prompt: string;
  generated_text: string;
  status: string;
  review_id: string | null;
  review_status: string | null;
  reviewer_comment: string | null;
}

// ────────────────────────────────────────────────────────────
// Governance (Module III)
// ────────────────────────────────────────────────────────────

export type ReviewDecision = 'approve' | 'reject' | 'request_changes';

export interface ReviewRecord {
  review_id: string;
  content_id: string;
  brand_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  reviewer_comment: string | null;
}

export interface AuditFinding {
  dimension: string;
  status: 'pass' | 'fail' | 'warning';
  observation: string;
  severity: 'critical' | 'moderate' | 'minor';
}

export interface ImageAuditResult {
  audit_id: string;
  brand_id: string;
  filename: string;
  passed: boolean;
  overall_score: number;
  findings: AuditFinding[];
  recommendations: string[];
}
