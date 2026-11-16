import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { api } from './client';
import type * as T from './types';

type Q = Record<string, string | number | boolean | undefined | null>;

export const keys = {
  tree: ['tree'] as const,
  node: (code: string) => ['node', code] as const,
};

export function useApi<R>(key: QueryKey, path: string | null, query?: Q) {
  return useQuery<R>({
    queryKey: [...key, query ?? {}],
    queryFn: () => api.get<R>(path as string, query),
    enabled: path !== null,
  });
}

/** Mutation that invalidates the given query prefixes when it succeeds. */
export function useAction<V, R = unknown>(fn: (v: V) => Promise<R>, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation<R, Error, V>({
    mutationFn: fn,
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
}

// --------------------------------------------------------------- library
export const useTree = () => useApi<T.TreeNode[]>(keys.tree, '/processes/nodes/tree/');
export const useNode = (code: string | null) =>
  useApi<T.ProcessNode>(['node', code], code ? `/processes/nodes/${code}/` : null);
export const useVersions = (code: string | null) =>
  useApi<T.ProcessVersion[]>(['versions', code], code ? '/processes/versions/' : null, { process__code: code });
export const useVersion = (id: number | null) =>
  useApi<T.ProcessVersion>(['version', id], id ? `/processes/versions/${id}/` : null);
export const useActivities = (query: Q) => useApi<T.Activity[]>(['activities'], '/processes/activities/', query);
export const useLanes = (code: string | null) =>
  useApi<T.Lane[]>(['lanes', code], code ? '/processes/lanes/' : null, { process__code: code });
export const useRisks = (code: string | null) =>
  useApi<T.Risk[]>(['risks', code], code ? '/processes/risks/' : null, { process__code: code });
export const useDocuments = (code: string | null) =>
  useApi<T.ProcessDocument[]>(['documents', code], code ? '/processes/documents/' : null, { process__code: code });
export const useNodeAction = <R>(code: string | null, action: string) =>
  useApi<R>(['node', code, action], code ? `/processes/nodes/${code}/${action}/` : null);

// --------------------------------------------------------------- kpis
export const useKpis = (query?: Q) => useApi<T.Kpi[]>(['kpis'], '/kpis/library/', query);
export const useObjectives = () => useApi<T.Objective[]>(['objectives'], '/kpis/objectives/');
export const useAlignment = () => useApi<T.Alignment>(['alignment'], '/kpis/alignment/');
export const useCascade = () => useApi<T.Cascade>(['cascade'], '/kpis/cascade/');
export const useTargets = (query?: Q) => useApi<T.KpiTarget[]>(['targets'], '/kpis/targets/', query);

// --------------------------------------------------------------- catalog / governance / hcm
export const useServices = (query?: Q) => useApi<T.Service[]>(['services'], '/catalog/services/', query);
export const useApprovals = (query?: Q) => useApi<T.ApprovalRequest[]>(['approvals'], '/governance/approvals/', query);
export const useAudit = (query?: Q) =>
  useApi<{ count: number; results: T.AuditEntry[] }>(['audit'], '/governance/audit/', {
    page: 1,
    page_size: 100,
    ...query,
  });
export const useSubJobFamilies = () => useApi<T.SubJobFamily[]>(['sjf'], '/hcm/sub-job-families/');
export const useOverview = () => useApi<T.Overview>(['overview'], '/overview/');
