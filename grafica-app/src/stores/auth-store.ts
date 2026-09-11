"use client"

import { create } from "zustand"
import { getUser } from "@/lib/api"

export type AuthUser = ReturnType<typeof getUser>

interface AuthState {
  user: AuthUser
  setUser: (user: AuthUser) => void
  clear: () => void
}

let listenersInstalled = false

export function syncAuthStore() {
  if (typeof window === "undefined" || listenersInstalled) return
  listenersInstalled = true
  const sync = () => useAuthStore.setState({ user: getUser() })
  window.addEventListener("grafica:user", sync)
  window.addEventListener("storage", sync)
}

export const useAuthStore = create<AuthState>((set) => ({
  user: getUser(),
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}))