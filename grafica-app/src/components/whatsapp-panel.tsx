"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type WaStatus = {
  connected: boolean;
  state: string;
  qr: string | null;
  enabled: boolean;
  phone: string;
};

const STATE_LABEL: Record<string, string> = {
  connecting: "Conectando… escaneie o QR",
  open: "Conectado",
  close: "Desconectado",
  logged_out: "Sessão encerrada",
};

export default function WhatsAppPanel() {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<WaStatus>("/api/whatsapp/status")
      .then((s) => {
        setStatus(s);
        setPhone((prev) => (prev === "" ? s.phone : prev));
        setEnabled(s.enabled);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean }>("/api/whatsapp/config", {
        method: "POST",
        body: JSON.stringify({ phone, enabled }),
      });
      if (res.ok) toast.success("Configuração salva");
    } catch {
      toast.error("Falha ao salvar");
    } finally {
      setBusy(false);
      load();
    }
  }

  async function test() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; queued: boolean; error?: string }>(
        "/api/whatsapp/test",
        { method: "POST", body: "{}" },
      );
      if (res.error) toast.error(res.error);
      else if (res.ok) toast.success("Mensagem de teste enviada!");
      else if (res.queued) toast.info("WhatsApp desconectado — aguardando pareamento");
    } catch {
      toast.error("Falha no teste");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      await api("/api/whatsapp/logout", { method: "POST", body: "{}" });
      toast.success("Sessão encerrada. Escaneie o QR novamente para conectar.");
    } catch {
      toast.error("Falha ao encerrar sessão");
    } finally {
      setBusy(false);
      load();
    }
  }

  const connected = status?.connected ?? false;

  return (
    <Card className="rounded-[24px] p-6 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Alertas no WhatsApp</h3>
            <p className="text-sm text-muted-foreground">
              Receba aviso quando um insumo ficar com estoque baixo ou zerado
            </p>
          </div>
          <Badge
            className={`${connected ? "bg-green-600" : "bg-muted text-foreground"} rounded-full`}
          >
            {connected ? "Conectado" : (STATE_LABEL[status?.state ?? ""] ?? "Desconectado")}
          </Badge>
        </div>

        {connected ? (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-xl px-4 py-3">
            <span className="size-2 rounded-full bg-green-600" />
            WhatsApp conectado — alertas serão enviados em tempo real.
          </div>
        ) : status?.qr ? (
          <div className="flex flex-col items-center gap-3 bg-gray-50 rounded-2xl p-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={status.qr}
              alt="QR Code do WhatsApp"
              className="h-56 w-56 rounded-xl bg-white p-2 shadow-sm"
            />
            <p className="text-sm text-muted-foreground text-center max-w-xs">
              Escaneie o QR Code com o <b>WhatsApp</b> do celular (Configurações
              &gt; Aparelhos conectados &gt; Conectar aparelho).
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Gerando QR Code… mantendo esta tela aberta.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
              Número de destino (com DDI/DDD)
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex: 5511987654321"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-3 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 accent-[var(--brand-purple)]"
              />
              Ativar alertas
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={busy} className="h-11 rounded-xl font-semibold">
            Salvar configuração
          </Button>
          <Button
            variant="outline"
            onClick={test}
            disabled={busy || !phone}
            className="h-11 rounded-xl font-semibold"
          >
            Enviar teste
          </Button>
          {connected && (
            <Button
              variant="ghost"
              onClick={logout}
              disabled={busy}
              className="h-11 rounded-xl font-semibold text-red-600"
            >
              Encerrar sessão
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
