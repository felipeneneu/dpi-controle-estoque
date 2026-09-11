"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  useWhatsAppStatus,
  useSaveWhatsAppConfig,
  useWhatsAppAction,
  useWhatsAppGroups,
  useWhatsAppRecipients,
  useSaveRecipient,
  useUpdateRecipient,
  useDeleteRecipient,
  type WaStatus,
} from "@/lib/queries/whatsapp";

const STATE_LABEL: Record<string, string> = {
  connecting: "Conectando… escaneie o QR",
  open: "Conectado",
  close: "Desconectado",
  logged_out: "Sessão encerrada",
};

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 2) return d ? `+${d}` : d;
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}

export default function WhatsAppPanel() {
  const statusQuery = useWhatsAppStatus();
  const status: WaStatus | null = statusQuery.data ?? null;
  const [phone, setPhone] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [wantGroups, setWantGroups] = useState(false);
  const saveConfig = useSaveWhatsAppConfig();
  const action = useWhatsAppAction();
  const groupsQuery = useWhatsAppGroups(wantGroups);

  const recipientsQuery = useWhatsAppRecipients();
  const addRecipient = useSaveRecipient();
  const updateRecipient = useUpdateRecipient();
  const deleteRecipient = useDeleteRecipient();
  const [newPhone, setNewPhone] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPriority, setNewPriority] = useState<"principal" | "backup">("principal");

  const busy = saveConfig.isPending || action.isPending;

  useEffect(() => {
    if (!status) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(status.enabled);
    if (phone === "") setPhone(status.phone);
    if (groupId === "" && status.groupId) setGroupId(status.groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function save() {
    try {
      const res = await saveConfig.mutateAsync({ phone, enabled });
      if (res.ok) toast.success("Configuração salva");
    } catch {
      toast.error("Falha ao salvar");
    }
  }

  async function saveGroup() {
    try {
      const res = await saveConfig.mutateAsync({ groupId: groupId || null });
      if (res.ok) toast.success("Grupo de alerta salvo");
    } catch {
      toast.error("Falha ao salvar grupo");
    }
  }

  async function test() {
    try {
      const res = await action.mutateAsync("test");
      if (res.error) toast.error(res.error);
      else if (res.ok) toast.success("Mensagem de teste enviada!");
      else if (res.queued) toast.info("WhatsApp desconectado — aguardando pareamento");
    } catch {
      toast.error("Falha no teste");
    }
  }

  async function logout() {
    try {
      await action.mutateAsync("logout");
      toast.success("Sessão encerrada. O novo QR será gerado automaticamente.");
    } catch {
      toast.error("Falha ao encerrar sessão");
    }
  }

  async function reconnect() {
    try {
      await action.mutateAsync("reconnect");
      toast.info("Gerando novo QR Code…");
    } catch {
      toast.error("Falha ao gerar QR Code");
    }
  }

  async function addNewRecipient() {
    if (!newPhone.trim()) {
      toast.error("Informe um telefone");
      return;
    }
    try {
      await addRecipient.mutateAsync({
        phone: newPhone.trim(),
        label: newLabel.trim() || undefined,
        priority: newPriority,
      });
      setNewPhone("");
      setNewLabel("");
      toast.success("Destinatário adicionado");
    } catch {
      toast.error("Falha ao adicionar destinatário");
    }
  }

  async function toggleRecipient(r: { id: string; active: boolean }) {
    try {
      await updateRecipient.mutateAsync({ id: r.id, active: !r.active });
    } catch {
      toast.error("Falha ao atualizar destinatário");
    }
  }

  const connected = status?.connected ?? false;
  const pendingRecipients = recipientsQuery.data ?? [];

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
            {status?.state === "logged_out"
              ? "Sessão encerrada. Gerando novo QR Code… mantendo esta tela aberta."
              : "Gerando QR Code… mantendo esta tela aberta."}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
              Número de destino (com DDI/DDD)
            </Label>
            <Input
              value={formatPhone(phone)}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
              placeholder="+55 (11) 98765-4321"
              inputMode="tel"
              className="h-11 rounded-xl"
            />
          </div>
          <div className="flex items-end">
            <div className="flex flex-col gap-1 pb-1">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="size-4 accent-[var(--brand-purple)]"
                />
                Ativar alertas
              </label>
              <p className="text-xs text-muted-foreground">
                Vale salvar clicando em Salvar configuração abaixo.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Grupo de alerta</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Envie também para um grupo. Busque os grupos do WhatsApp conectado e selecione.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              placeholder="ex: 1203...@g.us (ou selecione abaixo)"
              className="h-10 rounded-xl max-w-sm"
            />
            <Button
              variant="outline"
              onClick={() => {
                setWantGroups(true);
                groupsQuery.refetch();
              }}
              className="h-10 rounded-xl"
            >
              Buscar grupos
            </Button>
            <Button onClick={saveGroup} disabled={busy} className="h-10 rounded-xl">
              Salvar grupo
            </Button>
          </div>
          {wantGroups && (
            <div className="mt-2 max-w-md">
              {groupsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Buscando grupos…</p>
              ) : groupsQuery.error ? (
                <p className="text-xs text-red-600">Falha ao buscar grupos.</p>
              ) : (groupsQuery.data ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum grupo encontrado. Verifique se o WhatsApp está conectado e se o número
                  participa do grupo.
                </p>
              ) : (
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="w-full h-10 rounded-xl border bg-background px-3 text-sm"
                >
                  <option value="">Selecione um grupo…</option>
                  {(groupsQuery.data ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.subject} ({g.id})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900">Destinatários individuais</h4>
            <p className="text-xs text-muted-foreground">
              Complementam o grupo. Cada destinatário ativo recebe o alerta.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Telefone</Label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="+5511987654321"
                inputMode="tel"
                className="h-10 rounded-xl w-52"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Rótulo</Label>
              <Input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Gerente / Backup"
                className="h-10 rounded-xl w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-muted-foreground uppercase">Prioridade</Label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as "principal" | "backup")}
                className="w-32 h-10 rounded-xl border bg-background px-2 text-sm"
              >
                <option value="principal">Principal</option>
                <option value="backup">Backup</option>
              </select>
            </div>
            <Button
              onClick={addNewRecipient}
              disabled={addRecipient.isPending}
              className="h-10 rounded-xl"
            >
              Adicionar
            </Button>
          </div>

          <div className="space-y-2">
            {pendingRecipients.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum destinatário cadastrado. Sem grupo e sem destinatários, o alerta segue para
                o número de destino acima.
              </p>
            )}
            {pendingRecipients.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                  r.active ? "border-gray-200" : "border-gray-100 opacity-60"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium truncate">
                    {r.label || r.phone}
                    {r.label && <span className="text-muted-foreground ml-2">{r.phone}</span>}
                  </span>
                  <Badge
                    className={`w-fit ${
                      r.priority === "backup"
                        ? "bg-amber-100 text-amber-800 rounded-full"
                        : "bg-blue-100 text-blue-800 rounded-full"
                    }`}
                  >
                    {r.priority === "backup" ? "Backup" : "Principal"}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleRecipient(r)}
                    className="h-8 px-2 text-xs"
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await deleteRecipient.mutateAsync(r.id);
                      } catch {
                        toast.error("Falha ao remover");
                      }
                    }}
                    className="h-8 px-2 text-xs text-red-600"
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))}
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
          {!connected && (
            <Button
              variant="outline"
              onClick={reconnect}
              disabled={busy}
              className="h-11 rounded-xl font-semibold"
            >
              Gerar novo QR
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
