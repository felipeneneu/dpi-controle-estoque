"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, getUser, setUser, type UserRow, type UserPhoto } from "@/lib/api";
import WhatsAppPanel from "@/components/whatsapp-panel";
import { LoadingState, Spinner } from "@/components/ui/spinner";
import { RiPencilLine, RiUserAddLine } from "@remixicon/react";

const ROLE_LABEL: Record<string, string> = {
  DEV_MASTER: "Dev Master",
  ADMIN: "Admin",
  OPERATOR: "Operador",
};

const ROLE_OPTIONS = ["OPERATOR", "ADMIN", "DEV_MASTER"] as const;

function AvatarThumb({ user, className }: { user: UserRow; className?: string }) {
  const initials = user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return user.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.avatar} alt={user.name} className={`size-9 rounded-full object-cover ${className ?? ""}`} />
  ) : (
    <div className={`size-9 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold ${className ?? ""}`}>
      {initials}
    </div>
  );
}

export default function ConfigPage() {
  const router = useRouter();
  const user = getUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("OPERATOR");
  const [busy, setBusy] = useState(false);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState("OPERATOR");
  const [ePassword, setEPassword] = useState("");
  const [eAvatar, setEAvatar] = useState<string | null>(null);
  const [eBusy, setEBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([api<UserRow[]>("/api/users"), api<UserPhoto[]>("/api/user-photos").catch(() => [])])
      .then(([us, ph]) => {
        setUsers(us);
        setPhotos(ph);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
      return;
    }
    load();
  }, [load, router]);

  const canManage = user?.role === "DEV_MASTER";
  const canConfigure = user?.role === "DEV_MASTER" || user?.role === "ADMIN";

  async function create() {
    if (!name || !email || !password) return;
    setBusy(true);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName(""); setEmail(""); setPassword(""); setRole("OPERATOR");
      setOpen(false);
      load();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  function openEdit(u: UserRow) {
    setEditUser(u);
    setEName(u.name);
    setEEmail(u.email);
    setERole(u.role);
    setEPassword("");
    setEAvatar(u.avatar);
  }

  async function saveEdit() {
    if (!editUser || !eName || !eEmail) return;
    setEBusy(true);
    try {
      const body: Record<string, unknown> = { name: eName, email: eEmail, avatar: eAvatar };
      if (canManage && eRole) body.role = eRole;
      if (ePassword) body.password = ePassword;
      await api(`/api/users/${editUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
      if (editUser.id === user?.id) {
        setUser({
          id: user.id,
          name: eName,
          email: eEmail,
          role: canManage ? eRole : user.role,
          avatar: eAvatar,
        });
      }
      setEditUser(null);
      load();
    } catch {
    } finally {
      setEBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Configurações</h2>
          <p className="text-sm text-muted-foreground">Gestão de usuários e permissões</p>
        </div>
        {canManage && (
          <Button onClick={() => setOpen(true)} className="h-11 rounded-xl font-semibold">
            <RiUserAddLine className="w-5 h-5" />
            Novo Usuário
          </Button>
        )}
      </div>

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
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="py-2.5">
                      <div className="flex items-center gap-3">
                        <AvatarThumb user={u} />
                        <span className="font-medium text-gray-800">{u.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-muted-foreground">{u.email}</td>
                    <td className="py-2.5">
                      <Badge className={`${u.role === "DEV_MASTER" ? "bg-primary" : u.role === "ADMIN" ? "bg-brand-pink" : "bg-muted text-foreground"}`}>
                        {ROLE_LABEL[u.role] || u.role}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <Button variant="ghost" size="sm" className="rounded-xl text-primary" onClick={() => openEdit(u)}>
                        <RiPencilLine className="w-4 h-4" />
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {canConfigure && <WhatsAppPanel />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>Crie um acesso com perfil definido</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">E-mail *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Senha *</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Perfil</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={busy || !name || !email || !password}>
              {busy ? <Spinner className="size-4" /> : null}
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-h-[82vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Ajuste os dados do acesso</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
              <Input value={eName} onChange={(e) => setEName(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">E-mail *</Label>
              <Input type="email" value={eEmail} onChange={(e) => setEEmail(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nova senha (opcional)</Label>
              <Input type="password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} placeholder="Deixe vazio para manter" className="h-11 rounded-xl" />
            </div>
            {canManage && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Perfil</Label>
                <select
                  value={eRole}
                  onChange={(e) => setERole(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Foto (arquivos em /public/users)</Label>
              {photos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma foto encontrada em <code className="text-primary">/public/users</code>.
                </p>
              ) : (
                <div className="grid grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => setEAvatar(null)}
                    className={`flex items-center justify-center h-14 rounded-xl border text-xs font-semibold transition-colors ${
                      eAvatar === null ? "border-primary bg-primary/10 text-primary" : "border-gray-150 text-muted-foreground hover:bg-gray-50"
                    }`}
                  >
                    Sem foto
                  </button>
                  {photos.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setEAvatar(p.url)}
                      className={`aspect-square rounded-xl overflow-hidden ring-offset-2 transition-all ${
                        eAvatar === p.url ? "ring-2 ring-[var(--brand-purple)]" : "ring-1 ring-gray-200 hover:ring-gray-400"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
            <Button onClick={saveEdit} disabled={eBusy || !eName || !eEmail} className="rounded-xl font-semibold">
              {eBusy ? <Spinner className="size-4" /> : null}
              {eBusy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}