"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import { stockKeys } from "@/lib/queries/query-keys";

export function useStockSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = getSocket();

    // Entra na sala "estoque"
    socket.emit("chat:join", "estoque");

    const handleStockUpdated = (_payload?: { itemId?: string }) => {
      // Invalida todo o cache de estoque em tempo real
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
    };

    socket.on("stock:updated", handleStockUpdated);

    return () => {
      socket.off("stock:updated", handleStockUpdated);
      socket.emit("chat:leave", "estoque");
    };
  }, [queryClient]);
}
