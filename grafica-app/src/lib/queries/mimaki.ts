"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { mimakiKeys, stockKeys } from "@/lib/queries/query-keys"

export interface MimakiJob {
  id: string
  machineId: string
  folderTimestamp: string
  jobName: string
  orderCode: string | null
  quantityUnits: number
  pages: number
  copyNumber?: number | null
  totalPrint?: number | null
  passCount?: number | null
  resolutionDpi?: number | null
  printDirection?: string | null
  widthMm: number
  heightMm: number
  inkCyanCc: number | null
  inkMagentaCc: number | null
  inkYellowCc: number | null
  inkBlackCc: number | null
  inkWhite1Cc: number | null
  inkWhite2Cc: number | null
  inkVarnish1Cc: number | null
  inkVarnish2Cc: number | null
  inkTotalCc: number | null
  rawMaterialName: string | null
  lengthMeters: number | null
  materialStatus: "BOUND" | "PENDING_BIND"
  stockItemId: string | null
  stockItemName?: string | null
  stockDeducted?: boolean | null
  createdAt: string | null
}

export function useMimakiJobs(filters?: { status?: string; machine_id?: string }) {
  return useQuery({
    queryKey: mimakiKeys.jobList(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.status) params.set("status", filters.status)
      if (filters?.machine_id) params.set("machine_id", filters.machine_id)
      const qs = params.toString()
      return api<MimakiJob[]>(`/api/integrations/mimaki/jobs${qs ? `?${qs}` : ""}`)
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}

export function useMimakiJob(jobId?: string) {
  return useQuery({
    queryKey: mimakiKeys.jobDetail(jobId),
    queryFn: () => api<MimakiJob>(`/api/integrations/mimaki/jobs/${jobId}`),
    enabled: Boolean(jobId),
    staleTime: 10_000,
  })
}

export function useBindMaterial() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, stockItemId, bobinaId }: { jobId: string; stockItemId?: string; bobinaId?: string }) =>
      api(`/api/integrations/mimaki/jobs/${jobId}/bind-material`, {
        method: "POST",
        body: JSON.stringify({ stock_item_id: stockItemId, bobina_id: bobinaId }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mimakiKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export function useSyncMimakiStock() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ success: boolean; processedCount: number; message: string }>(
        "/api/integrations/mimaki/sync-stock",
        {
          method: "POST",
        }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mimakiKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export function useUpdateMimakiJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      jobId,
      lengthMeters,
      orderCode,
    }: {
      jobId: string
      lengthMeters?: number
      orderCode?: string | null
    }) =>
      api<{ success: boolean; length_meters: number; stock_adjusted_diff: number | null }>(
        `/api/integrations/mimaki/jobs/${jobId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            length_meters: lengthMeters,
            order_code: orderCode,
          }),
        }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mimakiKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

