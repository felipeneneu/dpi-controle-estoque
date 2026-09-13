"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type Machine, type MachineTelemetry } from "@/lib/api"
import { machineKeys, stockKeys } from "@/lib/queries/query-keys"

export function useMachines() {
  return useQuery({
    queryKey: machineKeys.list(),
    queryFn: () => api<Machine[]>("/api/machines"),
  })
}

export function useMachineTelemetry(id: string) {
  return useQuery({
    queryKey: machineKeys.telemetry(id),
    queryFn: () => api<MachineTelemetry>(`/api/machines/${id}/telemetry`),
    refetchInterval: 30_000,
    enabled: !!id,
  })
}

export function useCreateMachine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      brand: string
      model: string
      technology: string
      imageUrl?: string
      ip?: string
    }) => api("/api/machines", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: machineKeys.all }),
  })
}

export function useUpdateMachineMaterials() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, stockItemIds }: { id: string; stockItemIds: string[] }) =>
      api(`/api/machines/${id}/materials`, {
        method: "PATCH",
        body: JSON.stringify({ stockItemIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: machineKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export function useUpdateMachine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string
      body: {
        name?: string
        brand?: string
        model?: string
        technology?: string
        imageUrl?: string
        ip?: string
      }
    }) => api(`/api/machines/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: machineKeys.all }),
  })
}

export function useUpdateItemMachines() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, machineIds }: { id: string; machineIds: string[] }) =>
      api(`/api/stock-items/${id}/machines`, {
        method: "PATCH",
        body: JSON.stringify({ machineIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: machineKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export function useChangeBobina() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      machineId,
      newBobinaSerial,
      oldBobinaAction, // "FINISHED" | "RETURN_TO_STOCK"
    }: {
      machineId: string
      newBobinaSerial: string
      oldBobinaAction: "FINISHED" | "RETURN_TO_STOCK"
    }) =>
      api(`/api/machines/${machineId}/active-bobina`, {
        method: "POST",
        body: JSON.stringify({ newBobinaSerial, oldBobinaAction }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: machineKeys.all })
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}