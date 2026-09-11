"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { notificationKeys } from "@/lib/queries/query-keys"

export interface NotificationItem {
  id: string
  userId: string
  title: string
  body: string | null
  type: string
  read: boolean
  acknowledgedAt: string | null
  itemId: string | null
  alertLevel: string | null
  createdAt: string
}

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => api<NotificationItem[]>("/api/notifications"),
  })
}

export function useAckNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/notifications/${id}/ack`, { method: "POST" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() })
    },
  })
}

export function useClearNotifications() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/notifications", { method: "DELETE" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() })
    },
  })
}

export function useDeleteNotification() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<{ ok: boolean }>(`/api/notifications/${id}`, { method: "DELETE" }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() })
    },
  })
}
