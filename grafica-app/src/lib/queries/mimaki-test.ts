"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { mimakiTestKeys } from "@/lib/queries/query-keys"

export interface MimakiTestJob {
  id: string
  channel: string
  sourceFile: string
  keyFilename: string
  result: "OK" | "NG"
  resultDetail: string | null
  arrangeCnt: number | null
  inkCyanCc: number | null
  inkMagentaCc: number | null
  inkYellowCc: number | null
  inkBlackCc: number | null
  inkWhite1Cc: number | null
  inkWhite2Cc: number | null
  inkVarnish1Cc: number | null
  inkVarnish2Cc: number | null
  inkTotalCc: number | null
  ripSTime: string | null
  ripETime: string | null
  printSTime: string | null
  printETime: string | null
  parsedOrderCode: string | null
  parsedClient: string | null
  parsedMaterial: string | null
  parsedWidthMm: number | null
  parsedHeightMm: number | null
  parsedUnits: number | null
  parsedCopies: number | null
  parsedBobinaSerial: string | null
  heightMm: number | null
  linearMeters: number | null
  stockDeducted: boolean | null
  stockItemId: string | null
  bobinaId: string | null
  mimakiJobId: string | null
  parseErrors: string | null
  createdAt: string | null
}

export interface MimakiTestJobsResponse {
  total: number
  limit: number
  offset: number
  data: MimakiTestJob[]
}

export interface MimakiTestHealth {
  sourceAvailable: boolean
  lastScanAt: string | null
  lastScanError: string | null
  lastInserted: number
  sourceDir: string
}

export function useMimakiTestJobs(filters?: { result?: "OK" | "NG"; limit?: number }) {
  return useQuery({
    queryKey: mimakiTestKeys.list(),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters?.result) params.set("result", filters.result)
      if (filters?.limit) params.set("limit", String(filters.limit))
      const qs = params.toString()
      return api<MimakiTestJobsResponse>(`/api/mimaki-test/jobs${qs ? `?${qs}` : ""}`)
    },
    staleTime: 10_000,
    refetchInterval: 15_000,
    select: (res) => {
      const sorted = [...res.data].sort((a, b) => {
        const tA = a.printSTime ?? a.createdAt ?? 0
        const tB = b.printSTime ?? b.createdAt ?? 0
        return String(tB).localeCompare(String(tA))
      })
      return { ...res, data: sorted }
    },
  })
}

export function useMimakiTestHealth() {
  return useQuery({
    queryKey: mimakiTestKeys.health(),
    queryFn: () => api<MimakiTestHealth>("/api/mimaki-test/health"),
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

export function useMimakiTestScan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api<{ inserted: number; files: number; sourceAvailable: boolean; error: string | null }>(
        "/api/mimaki-test/scan",
        { method: "POST" }
      ),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: mimakiTestKeys.all })
    },
  })
}