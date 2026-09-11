"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type Supplier } from "@/lib/api"
import { supplierKeys } from "@/lib/queries/query-keys"

export function useSuppliers() {
  return useQuery({
    queryKey: supplierKeys.list(),
    queryFn: () => api<Supplier[]>("/api/suppliers"),
  })
}

export function useCreateSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; phone?: string; email?: string; contact?: string }) =>
      api("/api/suppliers", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}

export function useDeleteSupplier() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supplierKeys.all }),
  })
}