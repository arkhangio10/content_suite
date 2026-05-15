import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  auditImage,
  getContentFull,
  getReview,
  listAudits,
  listPendingReviews,
  reviewContent,
  submitContentForReview,
} from '@/api/governance';
import type { ReviewDecision } from '@/api/types';

export function usePendingReviews() {
  return useQuery({
    queryKey: ['governance-pending'],
    queryFn: () => listPendingReviews(),
    refetchInterval: 5000,
  });
}

export function useContentFull(contentId: string | null) {
  return useQuery({
    queryKey: ['content-full', contentId],
    queryFn: () => getContentFull(contentId!),
    enabled: !!contentId,
  });
}

export function useSubmitContentForReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contentId: string) => submitContentForReview(contentId),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['brand-content', record.brand_id] });
      qc.invalidateQueries({ queryKey: ['review', record.review_id] });
    },
  });
}

export function useReviewContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      reviewId: string;
      decision: ReviewDecision;
      comment?: string;
    }) => reviewContent(vars.reviewId, vars.decision, vars.comment),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ['review', record.review_id] });
      qc.invalidateQueries({ queryKey: ['brand-content', record.brand_id] });
    },
  });
}

export function useReview(reviewId: string | null) {
  return useQuery({
    queryKey: ['review', reviewId],
    queryFn: () => getReview(reviewId!),
    enabled: !!reviewId,
  });
}

export function useImageAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { brandId: string; file: File }) =>
      auditImage(vars.brandId, vars.file),
    onSuccess: (audit) => {
      qc.invalidateQueries({ queryKey: ['audits', audit.brand_id] });
    },
  });
}

export function useAudits(brandId: string | null) {
  return useQuery({
    queryKey: ['audits', brandId],
    queryFn: () => listAudits(brandId!),
    enabled: !!brandId,
  });
}
