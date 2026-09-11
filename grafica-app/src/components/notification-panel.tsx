"use client";

import { useState } from "react";
import { toast } from "sonner";
import { RiDeleteBinLine } from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications, useAckNotification, useClearNotifications, useDeleteNotification } from "@/lib/queries/notifications";

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  const ack = useAckNotification();
  const clearAll = useClearNotifications();
  const deleteSingle = useDeleteNotification();
  const items = notifications.data ?? [];
  const pending = items.filter((n) => !n.acknowledgedAt);

  async function confirm(id: string) {
    try {
      await ack.mutateAsync(id);
      toast.success("Alerta confirmado");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao confirmar";
      toast.error(msg);
    }
  }

  async function handleClearAll() {
    try {
      await clearAll.mutateAsync();
      toast.success("Notificações limpas com sucesso");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Falha ao limpar notificações";
      toast.error(msg);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setOpen((v) => !v)}
        className="relative h-9 rounded-xl font-semibold"
      >
        Notificações
        {pending.length > 0 && (
          <Badge className="ml-2 bg-red-600 text-white rounded-full">{pending.length}</Badge>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-gray-100 bg-card p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">Alertas de estoque</span>
            <div className="flex items-center gap-1.5">
              {pending.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearAll}
                  disabled={clearAll.isPending}
                  className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg gap-1"
                  title="Limpar todas as notificações"
                >
                  <RiDeleteBinLine className="size-3.5" />
                  {clearAll.isPending ? "Limpando…" : "Limpar tudo"}
                </Button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>

          {notifications.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : pending.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum alerta pendente.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto overflow-x-hidden pr-1 select-none scrollbar-hidden-hover">
              {pending.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl border border-gray-100 p-2.5 space-y-1.5 bg-muted/30"
                >
                  <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Button
                      size="sm"
                      onClick={() => confirm(n.id)}
                      disabled={ack.isPending}
                      className="h-7 rounded-lg text-xs"
                    >
                      Confirmar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await deleteSingle.mutateAsync(n.id);
                          toast.success("Notificação removida");
                        } catch {
                          toast.error("Falha ao remover");
                        }
                      }}
                      disabled={deleteSingle.isPending}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-lg ml-auto"
                      title="Excluir notificação"
                    >
                      <RiDeleteBinLine className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
