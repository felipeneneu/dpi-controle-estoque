"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Machine } from "@/lib/api";
import { useMimakiJobs } from "@/lib/queries/mimaki";
import { MimakiBindDialog } from "@/components/mimaki-bind-dialog";
import { ChangeBobinaDialog } from "@/components/change-bobina-dialog";
import { ChangeGarrafaDialog } from "@/components/change-garrafa-dialog";
import { useGarrafas } from "@/lib/queries/stock";
import type { MimakiJob } from "@/lib/queries/mimaki";

function isMimakiMachine(m: Machine): boolean {
  return /mimaki/i.test(m.brand);
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function MimakiInfoPanel({ machine }: { machine: Machine }) {
  const { data: pendingJobs = [] } = useMimakiJobs({ status: "PENDING_BIND", machine_id: machine.id });
  const { data: recentJobs = [] } = useMimakiJobs({ machine_id: machine.id });
  const { data: garrafas = [] } = useGarrafas();
  const [bindJob, setBindJob] = useState<MimakiJob | null>(null);
  const [changeBobinaOpen, setChangeBobinaOpen] = useState(false);
  const [changeGarrafaOpen, setChangeGarrafaOpen] = useState(false);

  const machineGarrafas = garrafas.filter(
    (g) => g.state === "IN_USE" && g.location === `machine:${machine.id}`,
  );

  return (
    <>
      <Card className="rounded-[24px] p-5 shadow-sm border-gray-100 bg-card">
        <CardContent className="p-0 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{machine.name}</h3>
              <p className="text-sm text-muted-foreground">
                {machine.brand} · {machine.model}
              </p>
            </div>
            <Badge className="bg-blue-100 text-blue-700">M2M</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-xs text-muted-foreground">Tecnologia</p>
              <p className="text-sm font-bold text-gray-900">{machine.technology}</p>
            </div>
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-bold text-gray-900">
                {machine.status === "ACTIVE" ? "Ativa" : machine.status === "MAINTENANCE" ? "Manutenção" : "Inativa"}
              </p>
            </div>
          </div>

          {machine.ip && (
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-xs text-muted-foreground">Endereço</p>
              <a
                href={`http://${machine.ip}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-blue-600 hover:underline"
              >
                http://{machine.ip}/
              </a>
            </div>
          )}

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-indigo-700 mb-1">Bobina Ativa</p>
              {machine.activeBobina ? (
                <div>
                  <p className="text-sm font-bold text-gray-900">{machine.activeBobina.serial}</p>
                  <p className="text-xs text-muted-foreground">{machine.activeBobina.metersRemaining.toFixed(2)}m restantes</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhuma bobina carregada</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setChangeBobinaOpen(true)} className="bg-white">
              Trocar Bobina
            </Button>
          </div>

          <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-fuchsia-700 mb-1">Garrafas de Tinta em Uso</p>
              {machineGarrafas.length > 0 ? (
                <div className="space-y-1">
                  {machineGarrafas.map((g) => (
                    <p key={g.id} className="text-sm text-gray-900 truncate">
                      <strong>{g.serial}</strong> · {g.mlRemaining}ml
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhuma garrafa definida nesta máquina</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setChangeGarrafaOpen(true)} className="bg-white shrink-0">
              Definir Garrafa
            </Button>
          </div>

          <div className="rounded-xl border border-gray-100 px-4 py-3">
            <p className="text-xs text-muted-foreground">Integração</p>
            <p className="text-sm text-gray-700">
              A Mimaki não exporta telemetria via rede. Jobs são recebidos via M2M (Mimaki Tracker Electron).
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-xs font-bold text-blue-700 mb-1">Como funciona</p>
            <ul className="text-xs text-blue-600 space-y-1">
              <li>• O Mimaki Tracker Electron envia logs de impressão via HTTP</li>
              <li>• Tinta e mídia são debitados automaticamente do estoque</li>
              <li>• Materiais não vinculados aparecem como pendentes</li>
            </ul>
          </div>

          {pendingJobs.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-amber-700">
                  Materiais Pendentes ({pendingJobs.length})
                </p>
              </div>
              <div className="space-y-2">
                {pendingJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-amber-100">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{job.jobName}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.rawMaterialName ?? "desconhecido"} · {job.lengthMeters?.toFixed(3)}m
                        {job.orderCode ? ` · OS ${job.orderCode}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-lg text-xs shrink-0 ml-2"
                      onClick={() => setBindJob(job)}
                    >
                      Vincular
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentJobs.length > 0 && (
            <div className="rounded-xl border border-gray-100 px-4 py-3">
              <p className="text-xs font-bold text-gray-700 mb-2">
                Últimos Jobs ({recentJobs.length})
              </p>
              <div className="space-y-1">
                {recentJobs.slice(0, 5).map((job) => (
                  <div key={job.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-700 truncate">{job.jobName}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-muted-foreground">{formatTime(job.createdAt)}</span>
                      <Badge
                        className={
                          job.materialStatus === "BOUND"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }
                      >
                        {job.materialStatus === "BOUND" ? "Vinculado" : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <MimakiBindDialog
        job={bindJob}
        open={!!bindJob}
        onOpenChange={(o) => { if (!o) setBindJob(null); }}
      />

      <ChangeBobinaDialog
        machine={machine}
        activeBobina={machine.activeBobina}
        open={changeBobinaOpen}
        onClose={() => setChangeBobinaOpen(false)}
      />

      <ChangeGarrafaDialog
        machine={machine}
        open={changeGarrafaOpen}
        onClose={() => setChangeGarrafaOpen(false)}
      />
    </>
  );
}

export { isMimakiMachine };
