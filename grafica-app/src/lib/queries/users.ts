"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type UserRow, type UserPhoto } from "@/lib/api"
import { userKeys, messageKeys, stockKeys } from "@/lib/queries/query-keys"

export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => api<UserRow[]>("/api/users"),
  })
}

export function useUserPhotos() {
  return useQuery({
    queryKey: userKeys.photos(),
    queryFn: () => api<UserPhoto[]>("/api/user-photos").catch(() => []),
  })
}

export interface CreateUserInput {
  name: string
  email: string
  password: string
  role?: string
  avatar?: string | null
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      api("/api/users", { method: "POST", body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

export interface UpdateUserInput {
  id: string
  name: string
  email: string
  role?: string
  password?: string
  avatar?: string | null
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserInput) =>
      api(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all })
      queryClient.invalidateQueries({ queryKey: messageKeys.all })
      queryClient.invalidateQueries({ queryKey: messageKeys.contacts() })
      queryClient.invalidateQueries({ queryKey: stockKeys.transactions() })
    },
  })
}