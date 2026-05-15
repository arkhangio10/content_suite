import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  generateContent,
  getContentItem,
  listBrandContent,
  submitForReview,
} from '@/api/creative';
import type { GenerateContentRequest } from '@/api/types';

export function useGenerateContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: GenerateContentRequest) => generateContent(req),
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: ['brand-content', item.brand_id] });
    },
  });
}

export function useSubmitForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => submitForReview(contentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brand-content'] });
    },
  });
}

export function useContentItem(contentId: string | null) {
  return useQuery({
    queryKey: ['content-item', contentId],
    queryFn: () => getContentItem(contentId!),
    enabled: !!contentId,
  });
}

export function useBrandContent(brandId: string | null) {
  return useQuery({
    queryKey: ['brand-content', brandId],
    queryFn: () => listBrandContent(brandId!),
    enabled: !!brandId,
  });
}
