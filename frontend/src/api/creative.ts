import { apiClient } from './client';
import type { ContentItem, GenerateContentRequest } from './types';

export async function generateContent(
  req: GenerateContentRequest,
): Promise<ContentItem> {
  const { data } = await apiClient.post<ContentItem>('/creative/generate', req);
  return data;
}

export async function submitForReview(contentId: string): Promise<{ content_id: string; status: string }> {
  const { data } = await apiClient.post(`/creative/${contentId}/submit`);
  return data;
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
