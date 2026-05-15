import { apiClient } from './client';
import type {
  ContentFull,
  ImageAuditResult,
  PendingReviewItem,
  ReviewDecision,
  ReviewRecord,
} from './types';

export async function submitContentForReview(contentId: string): Promise<ReviewRecord> {
  const { data } = await apiClient.post<ReviewRecord>(
    `/governance/content/${contentId}/submit`,
  );
  return data;
}

export async function reviewContent(
  reviewId: string,
  decision: ReviewDecision,
  comment = '',
): Promise<ReviewRecord> {
  const { data } = await apiClient.patch<ReviewRecord>(
    `/governance/content/${reviewId}/review`,
    { decision, comment },
  );
  return data;
}

export async function getReview(reviewId: string): Promise<ReviewRecord> {
  const { data } = await apiClient.get<ReviewRecord>(
    `/governance/content/${reviewId}`,
  );
  return data;
}

export async function auditImage(
  brandId: string,
  file: File,
): Promise<ImageAuditResult> {
  const form = new FormData();
  form.append('image', file);
  const { data } = await apiClient.post<ImageAuditResult>(
    `/governance/image/audit`,
    form,
    {
      params: { brand_id: brandId },
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return data;
}

export async function recordAuditDecision(
  auditId: string,
  decision: 'approve' | 'changes_requested',
  note: string,
): Promise<void> {
  await apiClient.post(`/governance/image/audit/${auditId}/decision`, { decision, note });
}

export async function listAudits(brandId: string): Promise<ImageAuditResult[]> {
  const { data } = await apiClient.get<ImageAuditResult[]>(
    `/governance/audits/${encodeURIComponent(brandId)}`,
  );
  return data;
}

export async function listPendingReviews(): Promise<{
  pending: PendingReviewItem[];
  count: number;
}> {
  const { data } = await apiClient.get('/governance/pending');
  return data;
}

export async function getContentFull(contentId: string): Promise<ContentFull> {
  const { data } = await apiClient.get<ContentFull>(
    `/governance/content/${contentId}/full`,
  );
  return data;
}
