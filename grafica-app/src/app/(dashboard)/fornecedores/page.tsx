"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, getUser, type Supplier } from "@/lib/api";
import { LoadingState } from "@/components/ui/spinner";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";

export default function FornecedoresPage() {
  const router = useRouter();
  const user = getUser();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Supplier[]>("/api/suppliers")
      .then(setSuppliers)
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

  async function create() {
    if (!name) return;
    setBusy(true);
    try {
      await api("/api/suppliers", {
        method: "POST",
        body: JSON.stringify({ name, phone, email, contact }),
      });
      setName(""); setPhone(""); setEmail(""); setContact("");
      setOpen(false);
      load();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await api(`/api/suppliers/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  const canDelete = user?.role === "DEV_MASTER";
  const canCreate = user?.role === "DEV_MASTER" || user?.role === "ADMIN";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Fornecedores</h2>
          <p className="text-sm text-muted-foreground">Cadastro de fornecedores da gráfica</p>
        </div>
        {canCreate && (
          <Button onClick={() => setOpen(true)} className="h-11 rounded-xl font-semibold">
            <RiAddLine className="w-5 h-5" />
            Novo Fornecedor
          </Button>
        )}
      </div>

      {loading ? (
        <LoadingState label="Carregando fornecedores…" />
      ) : suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</p>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {suppliers.map((s) => (
            <Card key={s.id} className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
              <CardContent className="p-0 space-y-2">
                <div className="flex items-start justify-between">
                  <h3 className="font-bold text-gray-900 text-lg">{s.name}</h3>
                  {canDelete && (
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-brand-pink" onClick={() => remove(s.id)}>
                      <RiDeleteBinLine className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {s.contact && <p className="text-sm text-muted-foreground">Contato: {s.contact}</p>}
                {s.phone && <p className="text-sm text-muted-foreground">Tel: {s.phone}</p>}
                {s.email && <p className="text-sm text-muted-foreground">Email: {s.email}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Fornecedor</DialogTitle>
            <DialogDescription>Preencha os dados do fornecedor</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Pessoa de contato</Label>
              <Input value={contact} onChange={(e) => setContact(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">E-mail</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 rounded-xl" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={busy || !name}>{busy ? "Salvando…" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
