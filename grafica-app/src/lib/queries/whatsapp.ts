"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { whatsappKeys } from "@/lib/queries/query-keys"

export interface WaStatus {
  connected: boolean
  state: string
  qr: string | null
  enabled: boolean
  phone: string
  groupId: string
}

export function useWhatsAppStatus(enabled = true) {
  return useQuery({
    queryKey: whatsappKeys.status(),
    queryFn: () => api<WaStatus>("/api/whatsapp/status"),
    enabled,
    refetchInterval: 4000,
  })
}

export function useSaveWhatsAppConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ phone, enabled, groupId }: { phone?: string; enabled?: boolean; groupId?: string | null }) =>
      api<{ ok: boolean }>("/api/whatsapp/config", {
        method: "POST",
        body: JSON.stringify({ phone, enabled, groupId }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.status() })
      queryClient.invalidateQueries({ queryKey: whatsappKeys.groups() })
    },
  })
}

export function useWhatsAppAction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: "test" | "logout" | "reconnect") =>
      api<{ ok: boolean; queued?: boolean; error?: string }>(`/api/whatsapp/${action}`, {
        method: "POST",
        body: "{}",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.status() }),
  })
}

export interface WaGroup {
  id: string
  subject: string
}

export function useWhatsAppGroups(enabled = true) {
  return useQuery({
    queryKey: whatsappKeys.groups(),
    queryFn: () => api<WaGroup[]>("/api/whatsapp/groups"),
    enabled,
  })
}

export interface WaRecipient {
  id: string
  phone: string
  label: string | null
  priority: "principal" | "backup"
  active: boolean
}

export function useWhatsAppRecipients() {
  return useQuery({
    queryKey: whatsappKeys.recipients(),
    queryFn: () => api<WaRecipient[]>("/api/whatsapp/recipients"),
  })
}

export function useSaveRecipient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { phone: string; label?: string; priority?: "principal" | "backup"; active?: boolean }) =>
      api<WaRecipient>("/api/whatsapp/recipients", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.recipients() }),
  })
}

export function useUpdateRecipient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & Partial<Omit<WaRecipient, "id" | "createdAt">>) =>
      api<WaRecipient>(`/api/whatsapp/recipients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.recipients() }),
  })
}

export function useDeleteRecipient() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/api/whatsapp/recipients/${id}`, { method: "DELETE" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: whatsappKeys.recipients() }),
  })
}