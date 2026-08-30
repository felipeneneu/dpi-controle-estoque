"use client";

import { useEffect, useState } from "react";
import { getUser } from "@/lib/api";

type AuthUser = ReturnType<typeof getUser>;

export function useUser(): AuthUser {
  const [user, setUser] = useState<AuthUser>(null);

  useEffect(() => {
    const sync = () => setUser(getUser());
    sync();
    window.addEventListener("grafica:user", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("grafica:user", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return user;
}