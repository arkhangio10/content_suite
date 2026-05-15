import { apiClient } from './client';
import type { ContentItem, GenerateContentRequest } from './types';

export async function generateContent(
  req: GenerateContentRequest,
): Promise<ContentItem> {
  const { data } = await apiClient.post<ContentItem>('/creative/generate', req);
  return data;
}

export async function submitForReview(contentId: string): Promise<{ content_id: string; status: string }> {
  // Hits the GOVERNANCE submit endpoint (not /creative/{id}/submit) so a review
  // record is created in _reviews — that's what Approver A's queue polls.
  const { data } = await apiClient.post(`/governance/content/${contentId}/submit`);
  return { content_id: data.content_id, status: data.status };
}

export async function getContentItem(contentId: string): Promise<ContentItem> {
  const { data } = await apiClient.get<ContentItem>(`/creative/${contentId}`);
  return data;
}

export async function listBrandContent(brandId: string): Promise<ContentItem[]> {
  const { data } = await apiClient.get<ContentItem[]>(
    `/creative/brand/${encodeURIComponent(brandId)}`,
  );
  return data;
}
