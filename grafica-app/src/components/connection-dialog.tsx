"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConnectionStatusBadge } from "@/components/connection-status";
import { backendUrl, setBackendUrl } from "@/lib/api";
import { checkHealth } from "@/lib/health";

type Discovered = { name: string; ip: string; port: number } | null;

/**
 * Modal de configuração de conexão usado na tela de login. Tenta descobrir o
 * servidor automaticamente (UDP broadcast via Electron) e, se não achar, permite
 * digitar o IP manualmente. Mostra o status da conexão em tempo real.
 */
export function ConnectionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [input, setInput] = useState(() => backendUrl());
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<Discovered>(null);
  const [testing, setTesting] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [msg, setMsg] = useState("");

  const runDiscovery = useCallback(async () => {
    if (!window.grafica?.discover) return;
    setSearching(true);
    setMsg("");
    try {
      const res = await window.grafica.discover();
      if (res) {
        const url = `http://${res.ip}:${res.port}`;
        setFound(res);
        setInput(url);
        setBackendUrl(url);
        setMsg(`Servidor encontrado: ${res.name} (${res.ip}:${res.port})`);
      } else {
        setFound(null);
        setMsg("Nenhum servidor encontrado na rede. Digite o IP manualmente.");
      }
    } catch {
      setFound(null);
      setMsg("Falha na descoberta automática. Digite o IP manualmente.");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      await runDiscovery();
    })();
    return () => {
      cancelled = true;
    };
  }, [open, runDiscovery]);

  async function test() {
    const clean = input.trim().replace(/\/+$/, "");
    if (!clean) return;
    setTesting("testing");
    setMsg("");
    try {
      const ok = await checkHealth(clean, 4000);
      if (ok) {
        setTesting("ok");
        setMsg("Backend respondeu: ok");
      } else {
        setTesting("fail");
        setMsg("Não foi possível conectar nessa URL");
      }
    } catch {
      setTesting("fail");
      setMsg("Não foi possível conectar nessa URL");
    }
  }

  function save() {
    const clean = input.trim().replace(/\/+$/, "");
    if (!clean) return;
    setBackendUrl(clean);
    setMsg("URL salva. Você já pode fechar e entrar.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conexão com o servidor</DialogTitle>
          <DialogDescription>
            Configure o endereço do servidor para conectar. A descoberta automática
            encontra o servidor na rede sem precisar digitar o IP.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <ConnectionStatusBadge />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
            URL do servidor
          </Label>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="http://192.168.0.10:3001"
            className="h-11 rounded-xl font-mono text-sm"
          />
        </div>

        {searching && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            Procurando servidor na rede…
          </div>
        )}

        {found && !searching && (
          <p className="text-sm font-medium text-emerald-600">
            Servidor encontrado: <b>{found.name}</b> ({found.ip}:{found.port})
          </p>
        )}

        {msg && !found && !searching && (
          <p className="text-sm text-muted-foreground">{msg}</p>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={runDiscovery} disabled={searching || typeof window === "undefined" || !window.grafica?.discover}>
              Procurar novamente
            </Button>
            <Button variant="ghost" onClick={test} disabled={testing === "testing" || !input.trim()}>
              {testing === "testing" ? <Spinner className="size-4" /> : null}
              Testar conexão
            </Button>
          </div>
          <Button onClick={save} disabled={!input.trim()}>
            Salvar URL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
