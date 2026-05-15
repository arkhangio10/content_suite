import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractBrief,
  generateBrandManual,
  getBrandManual,
  getJob,
  listBrandManuals,
  retrieveBrandChunks,
} from '@/api/brandDna';
import type { ProductBrief } from '@/api/types';

export function useListBrandManuals() {
  return useQuery({
    queryKey: ['brand-manuals-list'],
    queryFn: () => listBrandManuals(),
    refetchInterval: 6000, // refresh while user is on the page in case backend persists more
  });
}

/** Mutation: extract structured brief fields from natural-language text via Claude Haiku. ~$0.001/run. */
export function useExtractBrief() {
  return useMutation({
    mutationFn: (rawText: string) => extractBrief(rawText),
  });
}

/** Mutation: kick off a new brand-manual generation. Returns the job id. */
export function useGenerateBrandManual() {
  return useMutation({
    mutationFn: (brief: ProductBrief) => generateBrandManual(brief),
  });
}

/**
 * Polling query for an async pipeline job.
 * Refetches every 4s until status leaves "running".
 */
export function useJobStatus(jobId: string | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => getJob(jobId!),
    enabled: !!jobId && (options?.enabled ?? true),
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      if (!status || status === 'running') return 4000;
      return false;
    },
  });
}

export function useBrandManual(brandId: string | null) {
  return useQuery({
    queryKey: ['brand-manual', brandId],
    queryFn: () => getBrandManual(brandId!),
    enabled: !!brandId,
  });
}

export function useBrandRetrieval(brandId: string | null, query: string, topK = 8) {
  return useQuery({
    queryKey: ['brand-retrieve', brandId, query, topK],
    queryFn: () => retrieveBrandChunks(brandId!, query, topK),
    enabled: !!brandId && query.length >= 3,
  });
}

/** Helper: prefetch a brand manual after a job completes. */
export function useInvalidateBrandManual() {
  const qc = useQueryClient();
  return (brandId: string) => qc.invalidateQueries({ queryKey: ['brand-manual', brandId] });
}
