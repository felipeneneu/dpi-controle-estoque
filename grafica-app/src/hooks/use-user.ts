"use client";

import { useEffect } from "react";
import { useAuthStore, syncAuthStore } from "@/stores/auth-store";

export function useUser(): ReturnType<typeof useAuthStore.getState>["user"] {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    syncAuthStore();
  }, []);

  return user;
}