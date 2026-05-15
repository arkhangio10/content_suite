import { apiClient } from './client';
import type {
  BrandManual,
  ExtractedBrief,
  GenerateJobResponse,
  JobResponse,
  ManualListItem,
  ProductBrief,
} from './types';

export async function extractBrief(rawText: string): Promise<ExtractedBrief> {
  const { data } = await apiClient.post<ExtractedBrief>(
    '/brand-dna/extract-brief',
    { raw_text: rawText },
  );
  return data;
}

export async function generateBrandManual(
  brief: ProductBrief,
): Promise<GenerateJobResponse> {
  const { data } = await apiClient.post<GenerateJobResponse>(
    '/brand-dna/generate',
    brief,
  );
  return data;
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const { data } = await apiClient.get<JobResponse>(`/brand-dna/jobs/${jobId}`);
  return data;
}

export async function listBrandManuals(): Promise<{
  manuals: ManualListItem[];
  count: number;
  source: string;
}> {
  const { data } = await apiClient.get('/brand-dna/list');
  return data;
}

export async function getBrandManual(brandId: string): Promise<{
  brand_id: string;
  version: number;
  status: string;
  manual: BrandManual;
  source: 'cache' | 'database';
}> {
  const { data } = await apiClient.get(`/brand-dna/${encodeURIComponent(brandId)}`);
  return data;
}

export async function retrieveBrandChunks(
  brandId: string,
  query: string,
  topK = 8,
  section?: string,
): Promise<{
  brand_id: string;
  query: string;
  top_k: number;
  results: Array<{
    id: string;
    section_name: string;
    chunk_id: string;
    content: string;
    metadata: Record<string, unknown>;
    vector_score: number;
    text_score: number;
    hybrid_score: number;
  }>;
}> {
  const { data } = await apiClient.get(`/brand-dna/${encodeURIComponent(brandId)}/retrieve`, {
    params: { query, top_k: topK, section },
  });
  return data;
}
