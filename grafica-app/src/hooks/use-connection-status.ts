"use client";

import { useEffect, useState } from "react";
import { backendUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { checkHealth } from "@/lib/health";

export type ConnectionStatus = "online" | "reconnecting" | "offline";

const BASE_DELAY = 1000;
const MAX_DELAY = 30000;

/**
 * Monitora a conexão com o backend (health check com backoff exponencial)
 * combinado com o estado do Socket.IO. Usado para mostrar o indicador de
 * status (Conectado / Reconectando… / Servidor offline).
 */
export function useConnectionStatus(): ConnectionStatus {
  const url = backendUrl();
  const [status, setStatus] = useState<ConnectionStatus>("reconnecting");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = BASE_DELAY;
    let attempts = 0;

    const check = async () => {
      if (cancelled) return;
      const ok = await checkHealth(url, 4000);
      if (cancelled) return;
      if (ok) {
        setStatus("online");
        attempts = 0;
        delay = BASE_DELAY;
      } else {
        markDown();
      }
      if (!cancelled) {
        timer = setTimeout(check, delay);
      }
    };

    const markDown = () => {
      attempts += 1;
      setStatus(attempts === 1 ? "reconnecting" : "offline");
      delay = Math.min(delay * 2, MAX_DELAY);
    };

    check();

    const onConnect = () => setStatus("online");
    const onDisconnect = () => markDown();
    const socket = getSocket();
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, [url]);

  return status;
}
