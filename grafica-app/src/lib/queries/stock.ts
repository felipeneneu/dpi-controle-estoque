"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getUser, type StockItem, type StockTransaction, type Bobina, type Garrafa } from "@/lib/api"
import { machineKeys, stockKeys } from "@/lib/queries/query-keys"

export function useStockItems(category?: string) {
  return useQuery({
    queryKey: stockKeys.category(category),
    queryFn: () =>
      api<StockItem[]>(category ? `/api/stock-items?category=${category}` : "/api/stock-items"),
  })
}

export function useStockTransactions() {
  return useQuery({
    queryKey: stockKeys.transactions(),
    queryFn: () => api<StockTransaction[]>("/api/stock-transactions"),
  })
}

interface TransactionInput {
  itemId: string
  type: "IN" | "OUT"
  quantity: number
  reason?: string
}

export function useStockTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TransactionInput) => {
      const user = getUser()
      return api("/api/stock-transactions", {
        method: "POST",
        body: JSON.stringify({ ...input, userId: user?.id }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
      queryClient.invalidateQueries({ queryKey: machineKeys.all })
    },
  })
}

export function useCreateStockItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: {
      name: string
      category: string
      unit: string
      width?: number
      code?: string
      currentQuantity?: number
      minQuantity?: number
      machineId?: string
    }) => api<StockItem>("/api/stock-items", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
      queryClient.invalidateQueries({ queryKey: machineKeys.all })
    },
  })
}

export function useUpdateStockItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string
      name: string
      category: string
      unit: string
      width?: number
      code?: string
      currentQuantity?: number
      minQuantity?: number
    }) => api(`/api/stock-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: stockKeys.all })
    },
  })
}

export function useAddRoll() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api(`/api/stock-items/${id}/add-roll`, { method: "POST", body: JSON.stringify({ label }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useUpdateStockLabel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      api(`/api/stock-items/${id}/label`, { method: "PATCH", body: JSON.stringify({ label }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useBobinas(stockItemId?: string) {
  return useQuery({
    queryKey: stockKeys.bobinas(stockItemId),
    queryFn: () =>
      api<Bobina[]>(stockItemId ? `/api/bobinas?stockItemId=${stockItemId}` : "/api/bobinas"),
  })
}

export function useUpdateBobina() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Bobina> & { id: string }) =>
      api(`/api/bobinas/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useDischargeBobina() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/bobinas/${id}/discharge`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useGarrafas(stockItemId?: string) {
  return useQuery({
    queryKey: stockKeys.garrafas(stockItemId),
    queryFn: () =>
      api<Garrafa[]>(stockItemId ? `/api/garrafas?stockItemId=${stockItemId}` : "/api/garrafas"),
  })
}

export function useAddGarrafa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ stockItemId, mlInitial }: { stockItemId: string; mlInitial: number }) =>
      api(`/api/stock-items/${stockItemId}/add-garrafa`, {
        method: "POST",
        body: JSON.stringify({ mlInitial }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useUpdateGarrafa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<Garrafa> & { id: string }) =>
      api(`/api/garrafas/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}

export function useDischargeGarrafa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/garrafas/${id}/discharge`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: stockKeys.all }),
  })
}