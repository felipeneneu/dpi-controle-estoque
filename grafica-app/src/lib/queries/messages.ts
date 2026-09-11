"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getUser, type ChatMessage, type ChatContact } from "@/lib/api"
import { messageKeys } from "@/lib/queries/query-keys"

export function useMessages(room: string, before?: string) {
  const url = before
    ? `/api/messages?room=${room}&before=${encodeURIComponent(before)}`
    : `/api/messages?room=${room}`
  return useQuery({
    queryKey: messageKeys.list(room),
    queryFn: () => api<ChatMessage[]>(url),
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
}

export function useDmMessages(recipientId: string | null) {
  return useQuery({
    queryKey: messageKeys.dm(recipientId ?? ""),
    queryFn: () => api<ChatMessage[]>(`/api/messages/dm/${recipientId}`),
    enabled: !!recipientId,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
}

export async function fetchOlderMessages(params: {
  room: string
  recipientId?: string | null
  before: string
  limit?: number
}): Promise<ChatMessage[]> {
  const limit = params.limit ?? 50
  if (params.recipientId) {
    return api<ChatMessage[]>(
      `/api/messages/dm/${params.recipientId}?before=${encodeURIComponent(params.before)}&limit=${limit}`
    )
  }
  return api<ChatMessage[]>(
    `/api/messages?room=${params.room}&before=${encodeURIComponent(params.before)}&limit=${limit}`
  )
}

export function useContacts() {
  return useQuery({
    queryKey: messageKeys.contacts(),
    queryFn: () => api<ChatContact[]>("/api/chat/contacts"),
    staleTime: 10_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ room, recipientId, content }: { room: string; recipientId?: string; content: string }) =>
      api("/api/messages", { method: "POST", body: JSON.stringify({ room, recipientId, content }) }),
    onMutate: async ({ room, recipientId, content }) => {
      const isDm = !!recipientId
      const queryKey = isDm ? messageKeys.dm(recipientId) : messageKeys.list(room)

      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<ChatMessage[]>(queryKey)

      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        room,
        recipientId,
        content,
        senderId: getUser()?.id ?? "",
        senderName: getUser()?.name ?? "",
        createdAt: new Date().toISOString(),
      }
      queryClient.setQueryData<ChatMessage[]>(queryKey, (old = []) => [optimistic, ...old])
      return { room, recipientId, previous, isDm }
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous) {
        const queryKey = ctx.isDm && ctx.recipientId ? messageKeys.dm(ctx.recipientId) : messageKeys.list(ctx.room)
        queryClient.setQueryData(queryKey, ctx.previous)
      }
    },
    onSettled: (_data, _err, vars) => {
      if (vars.recipientId) {
        queryClient.invalidateQueries({ queryKey: messageKeys.dm(vars.recipientId) })
      }
      queryClient.invalidateQueries({ queryKey: messageKeys.list(vars.room) })
      queryClient.invalidateQueries({ queryKey: messageKeys.contacts() })
    },
  })
}