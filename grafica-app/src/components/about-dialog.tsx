"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AboutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const [info, setInfo] = useState<{
    version: string;
    electron: string;
    platform: string;
    mode: "server" | "client";
    packaged: boolean;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    if (typeof window.grafica?.info === "function") {
      window.grafica
        .info()
        .then((i) => {
          if (mounted) setInfo(i);
        })
        .catch(() => {
          if (mounted) setInfo(null);
        });
    }
    return () => {
      mounted = false;
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sobre o GráficaOS</DialogTitle>
          <DialogDescription>
            Sistema de controle de estoque para gráficas.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>Versão: {info?.version ?? "v0.1.0 — navegador"}</p>
          <p>Modo: {info ? (info.mode === "server" ? "Servidor local" : "Cliente") : "Navegador"}</p>
          {info?.electron && <p>Electron: {info.electron}</p>}
          {info?.platform && <p>Plataforma: {info.platform}</p>}
          {info?.packaged ? <p>Empacotado: sim</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}