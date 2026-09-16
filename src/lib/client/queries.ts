"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, type PostsQuery } from "./api";
import type { InsightsRange, PostSaveRequest, PostStatus, PublishRequest } from "@/types";

export const qk = {
  status: ["system-status"] as const,
  posts: (q: PostsQuery) => ["posts", q] as const,
  post: (id: string) => ["post", id] as const,
  approval: (id: string) => ["approval", id] as const,
  accounts: ["accounts"] as const,
  customPresets: ["custom-presets"] as const,
  stylePacks: ["style-packs"] as const,
  insights: (range: InsightsRange) => ["insights", range] as const,
};

export function useSystemStatus() {
  return useQuery({ queryKey: qk.status, queryFn: api.systemStatus, staleTime: 60_000 });
}

export function usePosts(q: PostsQuery = {}, enabled = true) {
  return useQuery({ queryKey: qk.posts(q), queryFn: () => api.listPosts(q), enabled });
}

export function usePost(id: string | null) {
  return useQuery({ queryKey: qk.post(id ?? ""), queryFn: () => api.getPost(id!), enabled: Boolean(id) });
}

export function useApproval(id: string | null) {
  return useQuery({ queryKey: qk.approval(id ?? ""), queryFn: () => api.approval(id!), enabled: Boolean(id) });
}

export function useAccounts() {
  return useQuery({ queryKey: qk.accounts, queryFn: api.accounts });
}

export function useCustomPresets() {
  return useQuery({ queryKey: qk.customPresets, queryFn: api.customPresets });
}

export function useStylePacks() {
  return useQuery({ queryKey: qk.stylePacks, queryFn: api.stylePacks });
}

export function useInsights(range: InsightsRange) {
  return useQuery({ queryKey: qk.insights(range), queryFn: () => api.insights(range), staleTime: 5 * 60_000 });
}

export function useCollectInsights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.collectInsights,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["insights"] });
      const ok = r.accounts.filter((a) => a.ok).length;
      const failed = r.accounts.filter((a) => !a.ok);
      if (r.accounts.length === 0) toast.info("연결된 Instagram 계정이 없어요. 설정에서 계정을 연결하세요.");
      else if (failed.length) toast.error(`수집 ${ok}/${r.accounts.length} · 실패: ${failed.map((f) => f.account_key).join(", ")}`);
      else toast.success(`인사이트 수집 완료 · 계정 ${ok}`);
    },
    onError: (e) => toast.error(`수집 실패: ${e instanceof Error ? e.message : String(e)}`),
  });
}

export function useInvalidatePosts() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ["posts"] });
    if (id) {
      void qc.invalidateQueries({ queryKey: qk.post(id) });
      void qc.invalidateQueries({ queryKey: qk.approval(id) });
    }
  };
}

export function useSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.sync,
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: qk.status });
      toast.success(`Inbox 동기화 완료 · 생성 ${r.created} · 수정 필요 ${r.needs_repair} · 건너뜀 ${r.skipped}${r.errors ? ` · 오류 ${r.errors}` : ""}`);
    },
    onError: (e) => toast.error(`동기화 실패: ${e instanceof Error ? e.message : String(e)}`),
  });
}

export function useSavePost(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (body: PostSaveRequest) => api.savePost(id, body),
    onSuccess: () => invalidate(id),
  });
}

export function useTransition(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (args: { to: PostStatus; run_at?: string; account_key?: string }) => api.transition(id, args.to, args),
    onSuccess: (b) => {
      invalidate(id);
      toast.success(`상태 변경: ${b.metadata.status}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useRepair(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (strategy: "folder" | "metadata") => api.repair(id, strategy),
    onSuccess: () => {
      invalidate(id);
      toast.success("복구 완료");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function usePublish(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: (body: PublishRequest) => api.publish(id, body),
    onSuccess: (r) => {
      invalidate(id);
      if (r.ok) toast.success(r.status === "scheduled" ? "예약 등록됨" : `게시 완료 · media ${r.ig_media_id ?? ""}`);
      else toast.error(`게시 실패: ${r.error ?? ""}`);
    },
    onError: (e) => {
      invalidate(id);
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });
}

export function useRetry(id: string) {
  const invalidate = useInvalidatePosts();
  return useMutation({
    mutationFn: () => api.retry(id),
    onSuccess: (r) => {
      invalidate(id);
      if (r.ok) toast.success("재게시 완료");
      else toast.error(`재시도 실패: ${r.error ?? ""}`);
    },
    onError: (e) => {
      invalidate(id);
      toast.error(e instanceof Error ? e.message : String(e));
    },
  });
}
