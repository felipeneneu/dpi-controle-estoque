"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ConnectionResult {
  connected: boolean;
  ip: string;
  responseTimeMs: number;
}

export function useMachineConnection(ip: string | null, options?: { refetchInterval?: number }) {
  return useQuery<ConnectionResult>({
    queryKey: ["machine-connection", ip],
    queryFn: () => api(`/api/machines/check-connection?ip=${encodeURIComponent(ip!)}`),
    enabled: !!ip,
    refetchInterval: options?.refetchInterval ?? 15000,
    refetchOnWindowFocus: true,
    staleTime: 10000,
  });
}
