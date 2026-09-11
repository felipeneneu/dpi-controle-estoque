"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { reportKeys } from "@/lib/queries/query-keys"

export interface MimakiTotals {
  jobs: number
  lengthMeters: number
  inkTotalCc: number
  inkCyanCc: number
  inkMagentaCc: number
  inkYellowCc: number
  inkBlackCc: number
  inkWhite1Cc: number
  inkWhite2Cc: number
  inkVarnish1Cc: number
  inkVarnish2Cc: number
}

export interface ConsumptionReport {
  month: string
  machineId: string | null
  machineName: string | null
  isKonica?: boolean
  isMimaki?: boolean
  totals: {
    jobs: number
    areaM2: number
    inkTotalMl: number
    inkCyanMl: number
    inkLightCyanMl: number
    inkMagentaMl: number
    inkLightMagentaMl: number
    inkYellowMl: number
    inkBlackMl: number
    inkOptimizerMl: number
  }
  konicaTotals?: {
    totalPages: number
    totalSheets: number
  }
  mimakiTotals?: MimakiTotals
  byMedia: { media: string; m2: number; jobs: number; sheets?: number; lengthMeters?: number }[]
}

export function useConsumptionReport(machineId: string, month: string) {
  const query = new URLSearchParams()
  if (machineId) query.set("machineId", machineId)
  if (month) query.set("month", month)
  const qs = query.toString()

  return useQuery({
    queryKey: reportKeys.consumption(machineId, month),
    queryFn: () => api<ConsumptionReport>(`/api/reports/consumption?${qs}`),
    enabled: !!month,
  })
}
