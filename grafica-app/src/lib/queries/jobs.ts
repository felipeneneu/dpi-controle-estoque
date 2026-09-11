"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { jobKeys, stockKeys } from "@/lib/queries/query-keys"

export interface PrintJobRow {
  id: string
  jobId: string
  jobName: string
  machineId: string
  machineName: string | null
  ripType: string
  inkCyanMl: number | null
  inkLightCyanMl: number | null
  inkMagentaMl: number | null
  inkLightMagentaMl: number | null
  inkYellowMl: number | null
  inkBlackMl: number | null
  inkOptimizerMl: number | null
  inkTotalMl: number | null
  mediaType: string | null
  mediaAreaM2: number | null
  pages: number | null
  sheets: number | null
  osNumber: string | null
  colorMode: string | null
  resolutionDpi: number | null
  passCount: number | null
  printDirection: string | null
  printMode: string | null
  optimizerEnabled: boolean | null
  inkProfile: string | null
  status: string | null
  printEndDate: string | null
  stockDeducted: boolean | null
  deductedAt: string | null
  hidden: boolean | null
  rollWidthUsed: number | null
  linearMetersDebited: number | null
  rawDataJson: string | null
  createdAt: string | null
}

export interface JobsListResponse {
  rows: PrintJobRow[]
  total: number
  page: number
  pageSize: number
}

export interface JobsFilters {
  machineId?: string
  month?: string
  monthScope?: "month" | "all"
  q?: string
  includeHidden?: boolean
  sortBy?: "date" | "name"
  sortDir?: "asc" | "desc"
  page?: number
  pageSize?: number
}

export function useJobs(filters: JobsFilters) {
  const params = new URLSearchParams()
  if (filters.machineId) params.set("machineId", filters.machineId)
  if (filters.month) params.set("month", filters.month)
  if (filters.monthScope) params.set("monthScope", filters.monthScope)
  if (filters.q) params.set("q", filters.q)
  if (filters.includeHidden) params.set("includeHidden", "true")
  if (filters.sortBy) params.set("sortBy", filters.sortBy)
  if (filters.sortDir) params.set("sortDir", filters.sortDir)
  if (filters.page) params.set("page", String(filters.page))
  if (filters.pageSize) params.set("pageSize", String(filters.pageSize))
  const qs = params.toString()

  return useQuery({
    queryKey: jobKeys.list(filters),
    queryFn: () => api<JobsListResponse>(`/api/jobs?${qs}`),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!filters.month || filters.monthScope === "all",
  })
}

export interface UpdateJobInput {
  id: string
  mediaType?: string
  osNumber?: string
}

export function useUpdateJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateJobInput) =>
      api(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
    },
  })
}

export interface HideJobInput {
  id: string
  hidden: boolean
  password: string
  adminEmail?: string
}

export function useHideJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, hidden, password, adminEmail }: HideJobInput) =>
      api<{ success: boolean; id: string; hidden: boolean; message: string }>(
        `/api/jobs/${id}/hide`,
        {
          method: "POST",
          body: JSON.stringify({ hidden, password, adminEmail }),
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
    },
  })
}

export function useSyncMachineJobsStock(machineId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ success: boolean; processedCount: number; message: string }>(
        `/api/machines/${machineId}/sync-stock`,
        { method: "POST" }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: jobKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}
