"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { notificationKeys, stockKeys, machineKeys } from "@/lib/queries/query-keys";
import { getUser, backendUrl } from "@/lib/api";
import { getSocket } from "@/lib/socket";

export function NotificationsProvider() {
  const url = backendUrl();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!getUser()) return;

    const socket = getSocket();

    const onConnect = () => {
      socket.emit("chat:join", "estoque");
    };

    const onNotif = (notif: { title: string; body?: string | null; type?: string }) => {
      toast(notif.title, {
        description: notif.body || undefined,
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    };

    const onStockDeducted = (data: { itemName: string; quantity: number; unit: string; jobName?: string }) => {
      toast("Estoque debitado", {
        description: `${data.itemName} — ${data.quantity} ${data.unit}${data.jobName ? ` (${data.jobName})` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: stockKeys.all });
      queryClient.invalidateQueries({ queryKey: machineKeys.all });
    };

    const onMimakiUnmatched = (data: { job_id: string; order_code?: string | null; job_name: string; raw_material_name?: string | null; length_meters: number }) => {
      toast("Material não vinculado", {
        description: `${data.job_name} — ${data.length_meters.toFixed(3)}m — ${data.raw_material_name ?? "desconhecido"}`,
      });
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    };

    const onNotifCleared = () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.list() });
    };

    socket.on("connect", onConnect);
    socket.on("notification:new", onNotif);
    socket.on("notification:cleared", onNotifCleared);
    socket.on("notification:deleted", onNotifCleared);
    socket.on("stock:deducted", onStockDeducted);
    socket.on("mimaki:unmatched_material", onMimakiUnmatched);

    if (socket.connected) {
      socket.emit("chat:join", "estoque");
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("notification:new", onNotif);
      socket.off("notification:cleared", onNotifCleared);
      socket.off("notification:deleted", onNotifCleared);
      socket.off("stock:deducted", onStockDeducted);
      socket.off("mimaki:unmatched_material", onMimakiUnmatched);
    };
  }, [url, queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
