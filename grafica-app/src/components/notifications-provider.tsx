"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { backendUrl, getUser } from "@/lib/api";

export function NotificationsProvider() {
  useEffect(() => {
    if (!getUser()) return;

    const socket = io(backendUrl(), {
      transports: ["websocket", "polling"],
    });

    socket.on("notification:new", (notif: { title: string; body?: string | null; type?: string }) => {
      toast(notif.title, {
        description: notif.body || undefined,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <Toaster position="bottom-right" richColors />
    </ThemeProvider>
  );
}
