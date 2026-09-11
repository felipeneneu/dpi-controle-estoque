"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { getUser, setBackendUrl, backendUrl, avatarUrl, type UserRow } from "@/lib/api";
import { useUser } from "@/hooks/use-user";
import { useUsers, useDeleteUser } from "@/lib/queries/users";
import WhatsAppPanel from "@/components/whatsapp-panel";
import UserDialog, { type UserDialogMode } from "@/components/user-dialog";
import { LoadingState, Spinner } from "@/components/ui/spinner";
import { RiPencilLine, RiUserAddLine, RiDeleteBinLine } from "@remixicon/react";

const ROLE_LABEL: Record<string, string> = {
  DEV_MASTER: "Dev Master",
  ADMIN: "Admin",
  OPERATOR: "Operador",
};

function AvatarThumb({ user, className }: { user: UserRow; className?: string }) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return user.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarUrl(user.avatar)} alt={user.name} className={`size-9 rounded-full object-cover ${className ?? ""}`} />
  ) : (
    <div className={`size-9 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold ${className ?? ""}`}>
      {initials}
    </div>
  );
}

export default function ConfigPage() {
  const router = useRouter();
  const user = useUser();
  const usersQuery = useUsers();
  const [dialog, setDialog] = useState<UserDialogMode | null>(null);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const deleteUserMutation = useDeleteUser();

  const [backendInput, setBackendInput] = useState("");
  const [backendTest, setBackendTest] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [backendMsg, setBackendMsg] = useState("");
  const [appMode, setAppMode] = useState<"server" | "client" | null>(null);
  const [netInfo, setNetInfo] = useState<{ hostname: string; ips: { name: string; address: string }[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBackendInput(backendUrl()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!window.grafica) return;
    let cancelled = false;
    window.grafica.info().then((i) => {
      if (!cancelled) setAppMode(i.mode);
    });
    window.grafica.net().then((n) => {
      if (!cancelled) setNetInfo(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setBackendMsg(`Copiado: ${text}`);
    } catch {
      setBackendMsg("Não foi possível copiar");
    }
  }

  async function testBackend() {
    const clean = backendInput.trim().replace(/\/+$/, "");
    if (!clean) return;
    setBackendTest("testing");
    setBackendMsg("");
    try {
      const res = await fetch(`${clean}/health`);
      const data = await res.json();
      if (res.ok && data?.status === "ok") {
        setBackendTest("ok");
        setBackendMsg("Backend respondeu: ok");
      } else {
        setBackendTest("fail");
        setBackendMsg(`Resposta inesperada (HTTP ${res.status})`);
      }
    } catch {
      setBackendTest("fail");
      setBackendMsg("Não foi possível conectar nessa URL");
    }
  }

  function saveBackendUrl() {
    const clean = backendInput.trim().replace(/\/+$/, "");
    if (!clean) return;
    setBackendUrl(clean);
    window.location.reload();
  }

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  const canManage = user?.role === "DEV_MASTER" || user?.role === "ADMIN";
  const canConfigure = user?.role === "DEV_MASTER" || user?.role === "ADMIN";

  const SYSTEM_BOT_IDS = ["system", "hp-agent-system", "konica-agent-system"];
  const users = usersQuery.data ?? [];
  const loading = canManage && usersQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
          <p className="text-sm text-muted-foreground">Gerencie usuários, WhatsApp e conexão</p>
        </div>
      </div>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsIndicator />
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          {canConfigure && <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>}
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios">
          <div className="space-y-4">
            {canManage && (
              <div className="flex justify-end">
                <Button onClick={() => setDialog({ kind: "create" })} className="h-11 rounded-xl font-semibold">
                  <RiUserAddLine className="w-5 h-5" />
                  Novo Usuário
                </Button>
              </div>
            )}

            {!canManage ? (
              <Card className="rounded-[24px] p-6 shadow-sm border-gray-100 bg-card">
                <CardContent className="p-0 text-sm text-muted-foreground">
                  Seu perfil ({user?.role}) não possui permissão para gerenciar usuários.
                </CardContent>
              </Card>
            ) : loading ? (
              <LoadingState label="Carregando usuários…" />
            ) : (
              <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-gray-100">
                        <th className="py-2">Usuário</th>
                        <th className="py-2">E-mail</th>
                        <th className="py-2">Perfil</th>
                        <th className="py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => {
                        const isSystem = SYSTEM_BOT_IDS.includes(u.id);
                        const isSelf = u.id === user?.id;
                        const canDelete = !isSystem && !isSelf && (user?.role === "DEV_MASTER" || u.role === "OPERATOR");

                        return (
                          <tr key={u.id} className="border-b border-gray-50">
                            <td className="py-2.5">
                              <div className="flex items-center gap-3">
                                <AvatarThumb user={u} />
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-800">{u.name}</span>
                                  {isSystem && (
                                    <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                      Sistema
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 text-muted-foreground">{u.email}</td>
                            <td className="py-2.5">
                              <Badge className={`${u.role === "DEV_MASTER" ? "bg-primary" : u.role === "ADMIN" ? "bg-brand-pink" : "bg-muted text-foreground"}`}>
                                {ROLE_LABEL[u.role] || u.role}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {!isSystem && (
                                  <Button variant="ghost" size="sm" className="rounded-xl text-primary" onClick={() => setDialog({ kind: "edit", user: u })}>
                                    <RiPencilLine className="w-4 h-4" />
                                    Editar
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button variant="ghost" size="sm" className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteUser(u)}>
                                    <RiDeleteBinLine className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {canConfigure && (
          <TabsContent value="whatsapp">
            <WhatsAppPanel />
          </TabsContent>
        )}

        <TabsContent value="conexao">
          <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
            <CardContent className="p-0 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Conexão com o Backend</h3>
                  <p className="text-xs text-muted-foreground">
                    URL em uso: <code className="text-primary">{backendUrl()}</code>
                  </p>
                </div>
                {appMode === "server" && (
                  <Badge className="bg-emerald-600">Servidor</Badge>
                )}
              </div>

              {appMode === "server" && netInfo && (
                <div className="space-y-1.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3">
                  <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Informe nos outros PCs (instalador Client):
                  </p>
                  {[...(netInfo.ips.length ? netInfo.ips.map((i) => `http://${i.address}:3001`) : []), `http://${netInfo.hostname}:3001`].map((u) => (
                    <div key={u} className="flex items-center justify-between gap-2">
                      <code className="text-xs font-mono text-emerald-700 truncate">{u}</code>
                      <Button variant="ghost" size="sm" className="rounded-xl h-7 px-2 text-xs" onClick={() => copyText(u)}>
                        Copiar
                      </Button>
                    </div>
                  ))}
                  {netInfo.ips.length === 0 && (
                    <p className="text-xs text-emerald-700">Sem IP de rede local detectado — verifique a conexão.</p>
                  )}
                </div>
              )}

              {appMode === "client" && (
                <p className="text-xs text-muted-foreground">
                  Peça ao administrador a URL do servidor (a barra verde do app Server) e cole abaixo.
                </p>
              )}

              <div className="flex gap-2">
                <Input
                  value={backendInput}
                  onChange={(e) => setBackendInput(e.target.value)}
                  placeholder="http://192.168.0.10:3001"
                  className="h-11 rounded-xl font-mono text-sm"
                />
                <Button variant="outline" onClick={testBackend} disabled={backendTest === "testing"} className="h-11 rounded-xl">
                  {backendTest === "testing" ? <Spinner className="size-4" /> : null}
                  Testar conexão
                </Button>
              </div>
              {backendMsg && (
                <p className={`text-xs font-medium ${backendTest === "ok" ? "text-emerald-600" : backendTest === "fail" ? "text-red-600" : "text-muted-foreground"}`}>
                  {backendMsg}
                </p>
              )}
              <Button onClick={saveBackendUrl} className="h-11 rounded-xl font-semibold">
                Salvar URL e recarregar
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <UserDialog mode={dialog} onClose={() => setDialog(null)} canManageRole={canManage} />

      <Dialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir <strong>{deleteUser?.name}</strong>? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteUser) return;
                try {
                  await deleteUserMutation.mutateAsync(deleteUser.id);
                  toast.success(`${deleteUser.name} excluído`);
                  setDeleteUser(null);
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : "Falha ao excluir usuário";
                  toast.error(msg);
                }
              }}
              disabled={deleteUserMutation.isPending}
              className="rounded-xl font-semibold"
            >
              {deleteUserMutation.isPending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
