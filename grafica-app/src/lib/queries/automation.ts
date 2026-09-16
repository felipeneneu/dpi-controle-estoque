"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  api,
  backendUrl,
  getToken,
  type ImpositionJob,
  type ImpositionJobInput,
  type ImpositionJobList,
} from "@/lib/api"
import { automationKeys } from "@/lib/queries/query-keys"

export interface RunImpositionPayload {
  jobId: string
  inputPdf: string
  sheetWMm: number
  sheetHMm: number
  gapMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  rotation: "auto" | "0" | "90"
  cols?: number
  rows?: number
  pecaWMm?: number
  pecaHMm?: number
}

export function useAutomationJobs(filters?: {
  status?: string
  q?: string
  page?: number
  pageSize?: number
}) {
  const params = new URLSearchParams()
  if (filters?.status) params.set("status", filters.status)
  if (filters?.q) params.set("q", filters.q)
  if (filters?.page) params.set("page", String(filters.page))
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize))
  const qs = params.toString()

  return useQuery({
    queryKey: automationKeys.list({
      status: filters?.status,
      q: filters?.q,
      page: filters?.page,
      pageSize: filters?.pageSize,
    }),
    queryFn: () => api<ImpositionJobList>(`/api/automation/jobs${qs ? `?${qs}` : ""}`),
    refetchInterval: 5_000,
  })
}

export function useAutomationJob(id?: string) {
  return useQuery({
    queryKey: automationKeys.detail(id ?? ""),
    queryFn: () => api<ImpositionJob>(`/api/automation/jobs/${id}`),
    enabled: !!id,
  })
}

export function useCreateImpositionJob() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: ImpositionJobInput) =>
      api<ImpositionJob>("/api/automation/jobs", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}

/** Executa o CLI nativo (AutoImposerCLI) via Electron para um job já criado. */
export function useRunImpositionElectron() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: RunImpositionPayload) => {
      const grafica = typeof window !== "undefined" ? window.grafica : undefined
      if (!grafica?.automation?.impose) {
        throw new Error("Runner disponível apenas no aplicativo de desktop (Electron).")
      }
      return await grafica.automation.impose({
        ...payload,
        baseUrl: backendUrl(),
        token: getToken() ?? undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: automationKeys.all })
    },
  })
}

/** Busca o PDF de arte via seletor nativo do Electron. */
export async function pickArtPdf(): Promise<string | null> {
  const grafica = typeof window !== "undefined" ? window.grafica : undefined
  if (!grafica?.automation?.pickArt) return null
  return await grafica.automation.pickArt()
}