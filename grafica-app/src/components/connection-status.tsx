"use client";

import { Badge } from "@/components/ui/badge";
import { useConnectionStatus, type ConnectionStatus } from "@/hooks/use-connection-status";

const LABELS: Record<ConnectionStatus, string> = {
  online: "Conectado",
  reconnecting: "Reconectando…",
  offline: "Servidor offline",
};

const STYLES: Record<ConnectionStatus, string> = {
  online: "bg-emerald-600",
  reconnecting: "bg-amber-500",
  offline: "bg-red-600",
};

export function ConnectionStatusBadge() {
  const status = useConnectionStatus();
  return (
    <Badge className={`${STYLES[status]} rounded-full`}>
      <span className="flex items-center gap-1.5">
        <span
          className={`size-1.5 rounded-full bg-white ${
            status === "reconnecting" ? "animate-pulse" : ""
          }`}
        />
        {LABELS[status]}
      </span>
    </Badge>
  );
}
