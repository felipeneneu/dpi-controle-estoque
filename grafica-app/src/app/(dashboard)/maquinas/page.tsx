"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger, TabsIndicator } from "@/components/ui/tabs";
import { getUser, isKonicaMachine, type Machine, type MachineTelemetry, type StockItem } from "@/lib/api";
import { useUser } from "@/hooks/use-user";
import { useStockItems, useUpdateStockItem } from "@/lib/queries/stock";
import {
  useMachines,
  useCreateMachine,
  useUpdateMachineMaterials,
  useUpdateMachine,
  useMachineTelemetry,
} from "@/lib/queries/machines";
import { useConsumptionReport } from "@/lib/queries/reports";
import { useMachineConnection } from "@/hooks/use-machine-connection";
import { LoadingState } from "@/components/ui/spinner";
import { MachineTelemetryPanel } from "@/components/machine-telemetry-panel";
import { KonicaTelemetryPanel } from "@/components/konica-telemetry-panel";
import { KonicaConsumoTab } from "@/components/konica-consumo-tab";
import { MimakiInfoPanel, isMimakiMachine } from "@/components/mimaki-info-panel";
import { MimakiConsumoTab } from "@/components/mimaki-consumo-tab";
import { MimakiJobsTab } from "@/components/mimaki-jobs-tab";
import { MimakiTestPanel } from "@/components/mimaki-test-panel";
import { JobsTab } from "@/components/machine-jobs-tab";
import { AddMaterialDialog } from "@/components/add-material-dialog";
import { MediaSelectDialog } from "@/components/media-select-dialog";

const isKonica = (m: Machine) => isKonicaMachine(m);
const isMimaki = (m: Machine) => isMimakiMachine(m);

function MachineTelemetryView({
  machine,
  telemetry,
}: {
  machine: Machine;
  telemetry?: MachineTelemetry;
}) {
  if (isMimaki(machine)) return <MimakiInfoPanel machine={machine} />;
  return isKonica(machine) ? (
    <KonicaTelemetryPanel machine={machine} telemetry={telemetry} />
  ) : (
    <MachineTelemetryPanel machine={machine} telemetry={telemetry} />
  );
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Ativa", cls: "bg-emerald-100 text-emerald-700" },
  MAINTENANCE: { label: "Manutenção", cls: "bg-amber-100 text-amber-700" },
  INACTIVE: { label: "Inativa", cls: "bg-gray-200 text-gray-600" },
};

const INK_COLORS = [
  { key: "inkCyanMl", label: "Ciano", color: "text-sky-500" },
  { key: "inkLightCyanMl", label: "Light Ciano", color: "text-cyan-600" },
  { key: "inkMagentaMl", label: "Magenta", color: "text-pink-500" },
  { key: "inkLightMagentaMl", label: "Light Magenta", color: "text-fuchsia-500" },
  { key: "inkYellowMl", label: "Amarelo", color: "text-yellow-500" },
  { key: "inkBlackMl", label: "Preto", color: "text-gray-800" },
  { key: "inkOptimizerMl", label: "Optimizer", color: "text-purple-500" },
] as const;

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

function ConnectionBadge({ ip }: { ip: string | null }) {
  const { data, isLoading } = useMachineConnection(ip, { refetchInterval: 15000 });

  if (!ip) return null;

  if (isLoading) {
    return (
      <span className="absolute top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold bg-gray-100 text-gray-500">
        Verificando...
      </span>
    );
  }

  const connected = data?.connected ?? false;

  return (
    <span
      className={`absolute top-3 left-3 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        connected
          ? "bg-emerald-100 text-emerald-700"
          : "bg-red-100 text-red-600"
      }`}
    >
      {connected ? "● Online" : "● Offline"}
    </span>
  );
}

function MachineCard({
  machine,
  linked,
  badge,
  canManage,
  onOpenMaterials,
  onEdit,
}: {
  machine: Machine;
  linked: string[];
  badge: (m: Machine) => { label: string; cls: string };
  canManage: boolean;
  onOpenMaterials: (m: Machine) => void;
  onEdit: (m: Machine) => void;
}) {
  return (
    <Card className="rounded-[24px] shadow-sm border-gray-100 bg-card overflow-hidden">
      <div className="relative h-44 bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <MachineImage
          imageUrl={machine.imageUrl}
          name={machine.name}
          className="w-full h-full object-contain p-3"
        />
        <ConnectionBadge ip={machine.ip} />
        <span className={`absolute top-3 right-3 rounded-full px-3 py-1 text-xs font-bold ${badge(machine).cls}`}>
          {badge(machine).label}
        </span>
      </div>
      <CardContent className="p-5 space-y-2">
        <h3 className="text-lg font-bold text-gray-900 truncate">{machine.name}</h3>
        <p className="text-sm text-muted-foreground">
          {machine.brand} · {machine.model}
        </p>
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{machine.technology}</p>
        {machine.ip && (
          <p className="text-xs text-muted-foreground">
            IP: {machine.ip}
          </p>
        )}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-800">
            {linked.length} material{linked.length === 1 ? "" : "is"}
          </span>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button
                variant="ghost"
                className="h-9 rounded-xl font-semibold text-sm text-muted-foreground"
                onClick={() => onEdit(machine)}
              >
                Editar
              </Button>
            )}
            <Button
              variant="outline"
              className="h-9 rounded-xl font-semibold text-sm"
              onClick={() => onOpenMaterials(machine)}
            >
              Materiais
            </Button>
            <Link href={`/maquinas?id=${machine.id}`}>
              <Button className="h-9 rounded-xl font-semibold text-sm">
                Canal
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TelemetrySection({ machines }: { machines: Machine[] }) {
  const withIp = machines.filter((m) => m.ip);
  if (withIp.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-3">
        Telemetria dos Equipamentos
      </h3>
      <div className="grid gap-5 lg:grid-cols-2">
        {withIp.map((m) => (
          <TelemetryCard key={m.id} machine={m} />
        ))}
      </div>
    </section>
  );
}

function TelemetryCard({ machine }: { machine: Machine }) {
  const telemetry = useMachineTelemetry(machine.id);
  return <MachineTelemetryView machine={machine} telemetry={telemetry.data} />;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function StatusTab({ machine }: { machine: Machine }) {
  const telemetry = useMachineTelemetry(machine.id);
  return <MachineTelemetryView machine={machine} telemetry={telemetry.data} />;
}

function ConsumoTab({ machine }: { machine: Machine }) {
  const [month, setMonth] = useState(currentMonth());
  const report = useConsumptionReport(machine.id, month);
  const r = report.data;

  return (
    <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-900">Consumo Mensal</h3>
            <p className="text-xs text-muted-foreground">
              Tinta e m² registrados nos jobs deste equipamento
            </p>
          </div>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-10 rounded-xl border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring"
          />
        </div>

        {report.isLoading ? (
          <LoadingState label="Carregando consumo…" />
        ) : r ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Jobs</p>
                <p className="text-xl font-bold text-gray-900">{r.totals.jobs}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Área impressa</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.totals.areaM2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²
                </p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">Tinta total</p>
                <p className="text-xl font-bold text-gray-900">
                  {r.totals.inkTotalMl.toLocaleString("pt-BR")} ml
                </p>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Tinta por cor (ml)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {INK_COLORS.map((ink) => (
                  <div
                    key={ink.key}
                    className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between"
                  >
                    <span className={`text-sm font-black ${ink.color}`}>{ink.label}</span>
                    <span className="text-sm tabular-nums text-gray-700">
                      {r.totals[ink.key].toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Área por tipo de mídia (m²)
              </p>
              {r.byMedia.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum job registrado para este período.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-gray-100">
                      <th className="py-2">Mídia</th>
                      <th className="py-2 text-right">Jobs</th>
                      <th className="py-2 text-right">m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.byMedia.map((m) => (
                      <tr key={m.media} className="border-b border-gray-50">
                        <td className="py-2 font-medium text-gray-800">{m.media}</td>
                        <td className="py-2 text-right text-muted-foreground">{m.jobs}</td>
                        <td className="py-2 text-right tabular-nums">
                          {m.m2.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MateriaisTab({ machine, items, canManage }: { machine: Machine; items: StockItem[]; canManage: boolean }) {
  const linked = (machine.itemIds ?? [])
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is StockItem => !!i);

  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editMin, setEditMin] = useState("");
  const [addMaterialOpen, setAddMaterialOpen] = useState(false);
  const updateStock = useUpdateStockItem();

  function openEdit(item: StockItem) {
    setEditItem(item);
    setEditQty(String(item.currentQuantity));
    setEditMin(String(item.minQuantity));
  }

  async function saveEdit() {
    if (!editItem) return;
    try {
      await updateStock.mutateAsync({
        id: editItem.id,
        name: editItem.name,
        category: editItem.category,
        unit: editItem.unit,
        currentQuantity: Number(editQty),
        minQuantity: Number(editMin),
      });
      toast.success(`${editItem.name} atualizado`);
      setEditItem(null);
    } catch {
      toast.error("Falha ao atualizar material");
    }
  }

  return (
    <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-gray-900">Materiais do Equipamento</h3>
            <p className="text-xs text-muted-foreground">
              Insumos vinculados usados nas impressões
            </p>
          </div>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setAddMaterialOpen(true)}
            >
              + Adicionar Material
            </Button>
          )}
        </div>

        {linked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum material vinculado a este equipamento.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {linked.map((i) => (
              <div
                key={i.id}
                className="rounded-xl border border-gray-100 px-3 py-2.5 flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-800">{i.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {i.category === "PAPER_MEDIA" ? "Mídia" : i.category === "INK_SUPPLY" ? "Tinta" : "Outro"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold">{i.currentQuantity}</p>
                    <p className="text-xs text-muted-foreground">{i.unit}</p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-lg text-xs"
                      onClick={() => openEdit(i)}
                    >
                      Editar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <AddMaterialDialog
        open={addMaterialOpen}
        onOpenChange={setAddMaterialOpen}
        machine={machine}
        allItems={items}
        currentlyLinkedIds={machine.itemIds ?? []}
      />

      <Dialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar {editItem?.name}</DialogTitle>
            <DialogDescription>
              Atualize a quantidade atual e mínima em estoque.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                Quantidade Atual ({editItem?.unit})
              </Label>
              <Input
                type="number"
                value={editQty}
                onChange={(e) => setEditQty(e.target.value)}
                className="h-11 rounded-xl"
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                Quantidade Mínima ({editItem?.unit})
              </Label>
              <Input
                type="number"
                value={editMin}
                onChange={(e) => setEditMin(e.target.value)}
                className="h-11 rounded-xl"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancelar
            </Button>
            <Button
              onClick={saveEdit}
              disabled={updateStock.isPending}
              className="rounded-xl font-semibold"
            >
              {updateStock.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function MachineChannelView({
  machine,
  items,
  canManage,
  loading,
  defaultTab = "status",
}: {
  machine?: Machine;
  items: StockItem[];
  canManage: boolean;
  loading: boolean;
  defaultTab?: string;
}) {
  const [mediaSelectOpen, setMediaSelectOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        setMediaSelectOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (loading) return <LoadingState label="Carregando canal…" />;

  if (!machine) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Canal do Equipamento</h2>
            <p className="text-sm text-muted-foreground">Equipamento não encontrado.</p>
          </div>
          <Link href="/maquinas">
            <Button variant="outline" className="h-11 rounded-xl font-semibold">
              Voltar
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            #{machine.name} <Badge className="bg-purple-800 text-white">{machine.model}</Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            Telemetria, consumo e materiais do equipamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setMediaSelectOpen(true)}
            className="h-11 rounded-xl font-semibold gap-2 border-primary/20 hover:bg-primary/5 text-primary"
          >
            Trocar Bobina <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded font-mono text-xs text-gray-700">F2</kbd>
          </Button>
          <Link href="/maquinas">
            <Button variant="outline" className="h-11 rounded-xl font-semibold">
              Voltar
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsIndicator />
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          {isMimaki(machine) && <TabsTrigger value="mimaki-teste">Mimaki Teste</TabsTrigger>}
          <TabsTrigger value="materiais">Materiais</TabsTrigger>
        </TabsList>
        <TabsContent value="status">
          <StatusTab machine={machine} />
        </TabsContent>
        <TabsContent value="jobs">
          {isMimaki(machine) ? (
            <MimakiJobsTab machine={machine} />
          ) : (
            <JobsTab machine={machine} />
          )}
        </TabsContent>
        <TabsContent value="consumo">
          {isMimaki(machine) ? (
            <MimakiConsumoTab machine={machine} />
          ) : isKonica(machine) ? (
            <KonicaConsumoTab machine={machine} />
          ) : (
            <ConsumoTab machine={machine} />
          )}
        </TabsContent>
        <TabsContent value="mimaki-teste">
          <MimakiTestPanel />
        </TabsContent>
        <TabsContent value="materiais">
          <MateriaisTab machine={machine} items={items} canManage={canManage} />
        </TabsContent>
      </Tabs>

      <MediaSelectDialog
        open={mediaSelectOpen}
        onOpenChange={setMediaSelectOpen}
        machine={machine}
        activeBobina={machine.activeBobina}
      />
    </div>
  );
}

export default function MachinesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const channelId = searchParams.get("id");
  const user = useUser();
  const canManage = user?.role === "DEV_MASTER" || user?.role === "ADMIN";

  const machinesQuery = useMachines();
  const itemsQuery = useStockItems();
  const machines = machinesQuery.data ?? [];
  const items = itemsQuery.data ?? [];
  const createMachine = useCreateMachine();
  const saveMaterials = useUpdateMachineMaterials();
  const updateMachine = useUpdateMachine();

  useEffect(() => {
    if (!getUser()) {
      router.replace("/auth");
    }
  }, [router]);

  const loading = machinesQuery.isLoading || itemsQuery.isLoading;

  const [edit, setEdit] = useState<Machine | null>(null);
  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const [openEdit, setOpenEdit] = useState(false);
  const [em, setEm] = useState(""); const [eb, setEb] = useState(""); const [emo, setEmo] = useState("");
  const [et, setEt] = useState(""); const [ei, setEi] = useState(""); const [eip, setEip] = useState("");
  const [ebl, setEbl] = useState("");

  const [openNew, setOpenNew] = useState(false);
  const [nm, setNm] = useState(""); const [nb, setNb] = useState(""); const [nmo, setNmo] = useState("");
  const [nt, setNt] = useState(""); const [ni, setNi] = useState(""); const [nip, setNip] = useState("");
  const [nbl, setNbl] = useState("");

  const orphans = useMemo(
    () => (itemsQuery.data ?? []).filter((i) => (i.machineIds?.length ?? 0) === 0),
    [itemsQuery.data],
  );

  if (channelId) {
    const machine = machines.find((m) => m.id === channelId);
    return (
      <MachineChannelView
        machine={machine}
        items={items}
        canManage={canManage}
        loading={loading}
        defaultTab={searchParams.get("tab") || "status"}
      />
    );
  }

  function openMaterials(m: Machine) {
    setEdit(m);
    setSelected(m.itemIds ?? []);
  }

  async function onSaveMaterials() {
    if (!edit) return;
    try {
      await saveMaterials.mutateAsync({ id: edit.id, stockItemIds: selected });
      toast.success("Materiais atualizados");
      setEdit(null);
    } catch {
      toast.error("Falha ao salvar materiais");
    }
  }

  async function onCreateMachine() {
    if (!nm || !nb || !nmo || !nt) return;
    try {
      await createMachine.mutateAsync({
        name: nm,
        brand: nb,
        model: nmo,
        technology: nt,
        imageUrl: ni || undefined,
        ip: nip || undefined,
        bleedAdjustmentM: nbl ? parseFloat(nbl) : undefined,
      });
      toast.success("Máquina cadastrada");
      setNm(""); setNb(""); setNmo(""); setNt(""); setNi(""); setNip(""); setNbl("");
      setOpenNew(false);
    } catch {
      toast.error("Falha ao cadastrar máquina");
    }
  }

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function openEditMachine(m: Machine) {
    setEditTarget(m);
    setEm(m.name); setEb(m.brand); setEmo(m.model); setEt(m.technology);
    setEi(m.imageUrl ?? ""); setEip(m.ip ?? ""); setEbl(m.bleedAdjustmentM?.toString() || "");
    setOpenEdit(true);
  }

  async function onSaveEdit() {
    if (!editTarget) return;
    try {
      await updateMachine.mutateAsync({
        id: editTarget.id,
        body: { 
          name: em, brand: eb, model: emo, technology: et, 
          imageUrl: ei || undefined, ip: eip || undefined,
          bleedAdjustmentM: ebl ? parseFloat(ebl) : undefined,
        },
      });
      toast.success("Máquina atualizada");
      setOpenEdit(false);
    } catch {
      toast.error("Falha ao atualizar máquina");
    }
  }

  const busy = saveMaterials.isPending || createMachine.isPending;

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
            <MachineCard
              key={m.id}
              machine={m}
              linked={linked}
              badge={badge}
              canManage={canManage}
              onOpenMaterials={openMaterials}
              onEdit={openEditMachine}
            />
          );
        })}
      </div>

      <TelemetrySection machines={machines} />

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
            <Button onClick={onSaveMaterials} disabled={busy} className="rounded-xl font-semibold">
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Máquina</DialogTitle>
            <DialogDescription>Atualize os dados do equipamento, incluindo o IP para monitoramento de conexão.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Nome *</Label>
              <Input value={em} onChange={(e) => setEm(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Mimaki UCJV300-75" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Marca *</Label>
                <Input value={eb} onChange={(e) => setEb(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Mimaki" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Modelo *</Label>
                <Input value={emo} onChange={(e) => setEmo(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: UCJV300-75" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Tecnologia *</Label>
              <Input value={et} onChange={(e) => setEt(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: Inkjet / Latex / Laser" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Imagem (caminho)</Label>
              <Input value={ei} onChange={(e) => setEi(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: /machine/mimaki.jfif" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">IP (para monitorar conexão)</Label>
              <Input value={eip} onChange={(e) => setEip(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: 192.168.234.10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Fator de Sangria/Avanço (m)</Label>
              <Input type="number" step="0.01" value={ebl} onChange={(e) => setEbl(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: 0.15" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenEdit(false)}>Cancelar</Button>
            <Button onClick={onSaveEdit} disabled={updateMachine.isPending || !em || !eb || !emo || !et} className="rounded-xl font-semibold">
              {updateMachine.isPending ? "Salvando…" : "Salvar"}
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
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">IP (opcional)</Label>
              <Input value={nip} onChange={(e) => setNip(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: 192.168.234.10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Fator de Sangria/Avanço (m)</Label>
              <Input type="number" step="0.01" value={nbl} onChange={(e) => setNbl(e.target.value)} className="h-11 rounded-xl" placeholder="Ex: 0.15" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={onCreateMachine} disabled={busy || !nm || !nb || !nmo || !nt} className="rounded-xl font-semibold">
              {busy ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}