"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { backendUrl, clearSession } from "@/lib/api";
import { checkHealth } from "@/lib/health";
import { cn } from "@/lib/utils";

const MAX_WAIT = 15000;

/**
 * Tela de splash exibida enquanto o backend ainda não está disponível.
 * Limpa sessão e redireciona para /auth ao iniciar.
 */
export function AppGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();

    const loop = async () => {
      while (!cancelled) {
        const ok = await checkHealth(backendUrl(), 3000);
        if (cancelled) return;
        if (ok) {
          clearSession();
          if (!cancelled) {
            router.replace("/auth");
          }
          setReady(true);
          return;
        }
        if (Date.now() - started > MAX_WAIT) {
          setReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    };

    loop();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <>
      {children}
      {!ready && (
        <div
          className={cn(
            "fixed inset-0 z-[100] flex items-center justify-center bg-background",
            "transition-opacity duration-300",
          )}
        >
          <div className="flex flex-col items-center gap-5">
            <div className="size-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">Dpi Controle de Estoque</p>
              <p className="text-sm text-muted-foreground">Conectando ao servidor…</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
