"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { api, getUser, type Machine, type StockItem } from "@/lib/api";
import { LoadingState } from "@/components/ui/spinner";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700" },
  MAINTENANCE: { label: "Manutenção", cls: "bg-amber-100 text-amber-700" },
  INACTIVE: { label: "Inativa", cls: "bg-gray-200 text-gray-600" },
};

function MachineImage({ imageUrl, name, className }: { imageUrl?: string | null; name: string; className?: string }) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={name} className={className} onError={(e) => { e.currentTarget.style.display = "none"; }} />;
  }
  return (
    <div className={`flex items-center justify-center bg-primary/10 text-primary font-black ${className}`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default function MachinesPage() {
  const router = useRouter();
  const user = getUser();
  const canManage = user?.role === "DEV_MASTER" || user?.role === "ADMIN";

  const [machines, setMachines] = useState<Machine[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState<Machine | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const [openNew, setOpenNew] = useState(false);
  const [nm, setNm] = useState(""); const [nb, setNb] = useState(""); const [nmo, setNmo] = useState("");
  const [nt, setNt] = useState(""); const [ni, setNi] = useState("");
  const [creating, setCreating] = useState(false);

  const orphans = useMemo(
    () => items.filter((i) => (i.machineIds?.length ?? 0) === 0),
    [items],
  );

  const load = useCallback(() => {
    Promise.all([api<Machine[]>("/api/machines"), api<StockItem[]>("/api/stock-items")])
      .then(([m, i]) => {
        setMachines(m);
        setItems(i);
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

  function openMaterials(m: Machine) {
    setEdit(m);
    setSelected(m.itemIds ?? []);
  }

  async function saveMaterials() {
    if (!edit) return;
    setBusy(true);
    try {
      await api(`/api/machines/${edit.id}/materials`, {
        method: "PATCH",
        body: JSON.stringify({ stockItemIds: selected }),
      });
      toast.success("Materiais atualizados");
      setEdit(null);
      load();
    } catch {
      toast.error("Falha ao salvar materiais");
    } finally {
      setBusy(false);
    }
  }

  async function createMachine() {
    if (!nm || !nb || !nmo || !nt) return;
    setCreating(true);
    try {
      await api("/api/machines", {
        method: "POST",
        body: JSON.stringify({
          name: nm,
          brand: nb,
          model: nmo,
          technology: nt,
          imageUrl: ni || undefined,
        }),
      });
      toast.success("Máquina cadastrada");
      setNm(""); setNb(""); setNmo(""); setNt(""); setNi("");
      setOpenNew(false);
      load();
    } catch {
      toast.error("Falha ao cadastrar máquina");
    } finally {
      setCreating(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  if (loading) return <LoadingState label="Carregando máquinas…" />;

  const badge = (m: Machine) => STATUS_BADGE[m.status] ?? STATUS_BADGE.ACTIVE;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Máquinas</h2>
          <p className="text-sm text-muted-foreground">
            Selecione os materiais usados em cada máquina
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenNew(true)} className="h-11 rounded-xl font-semibold">
            Nova Máquina
          </Button>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {machines.map((m) => {
          const linked = m.itemIds ?? [];
          return (
            <Card key={m.id} className="rounded-[24px] shadow-sm border-gray-100 bg-card overflow-hidden">
              <div className="relative h-44 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <MachineImage
                  imageUrl={m.imageUrl}
                  name={m.name}
                  className="w-full h-full object-contain p-3"
                />
                <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${badge(m).cls}`}>
                  {badge(m).label}
                </span>
              </div>
              <CardContent className="p-5 space-y-2">
                <h3 className="text-lg font-bold text-gray-900 truncate">{m.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {m.brand} · {m.model}
                </p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{m.technology}</p>
                <div className="pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">
                    {linked.length} material{linked.length === 1 ? "" : "is"}
                  </span>
                  <Button
                    variant="outline"
                    className="h-9 rounded-xl font-semibold text-sm"
                    onClick={() => openMaterials(m)}
                  >
                    Selecionar materiais
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-[24px] border-dashed bg-card/60">
        <CardContent className="p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-3">
            Materiais sem máquina (não requerem impressão)
          </h3>
          {orphans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todos os materiais estão vinculados a alguma máquina.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {orphans.map((i) => (
                <Badge key={i.id} className="bg-gray-100 text-gray-700 rounded-full py-1.5">
                  {i.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.name} — materiais usados</DialogTitle>
            <DialogDescription>
              Marque os insumos que este equipamento utiliza. Materiais sem máquina não requerem impressão.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {items.map((i) => (
              <label
                key={i.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border text-sm cursor-pointer transition-colors ${
                  selected.includes(i.id) ? "border-primary/60 bg-primary/5" : "border-gray-150 hover:bg-gray-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(i.id)}
                  onChange={() => toggle(i.id)}
                  className="size-4 accent-[var(--brand-purple)]"
                />
                <span className="flex-1 font-medium text-gray-800">{i.name}</span>
                <span className="text-xs text-muted-foreground">
                  {i.category === "PAPER_MEDIA" ? "Mídia" : i.category === "INK_SUPPLY" ? "Tinta" : "Outro"}
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button>
            <Button onClick={saveMaterials} disabled={busy} className="rounded-xl font-semibold">
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Máquina</DialogTitle>
            <DialogDescription>Cadastre um novo equipamento da gráfica</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
              <Input value={nm} onChange={(e) => setNm(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Mimaki UCJV300-75" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Marca *</Label>
                <Input value={nb} onChange={(e) => setNb(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Mimaki" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Modelo *</Label>
                <Input value={nmo} onChange={(e) => setNmo(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: UCJV300-75" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Tecnologia *</Label>
              <Input value={nt} onChange={(e) => setNt(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Inkjet / Latex / Laser" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Imagem (caminho)</Label>
              <Input value={ni} onChange={(e) => setNi(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: /machine/mimaki.jfif" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={createMachine} disabled={creating || !nm || !nb || !nmo || !nt} className="rounded-xl font-semibold">
              {creating ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}