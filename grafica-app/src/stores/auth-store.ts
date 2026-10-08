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
  if (typeof window === "undefined") return
  if (!listenersInstalled) {
    listenersInstalled = true
    const sync = () => useAuthStore.setState({ user: getUser() })
    window.addEventListener("grafica:user", sync)
    window.addEventListener("storage", sync)
  }
  const current = useAuthStore.getState().user
  const stored = getUser()
  if (current !== stored && JSON.stringify(current) !== JSON.stringify(stored)) {
    useAuthStore.setState({ user: stored })
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clear: () => set({ user: null }),
}))