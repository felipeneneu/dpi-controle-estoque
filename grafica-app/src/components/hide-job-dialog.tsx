"use client"

import { useState } from "react"
import { toast } from "sonner"
import { RiEyeLine, RiEyeOffLine, RiLockPasswordLine, RiShieldCheckLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { useHideJob, type PrintJobRow } from "@/lib/queries/jobs"
import { useUser } from "@/hooks/use-user"
import { BRASILIA_TZ } from "@/components/machine-jobs-table"

interface HideJobDialogProps {
  job: PrintJobRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBRT(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BRASILIA_TZ,
  })
}

export function HideJobDialog({ job, open, onOpenChange }: HideJobDialogProps) {
  const [password, setPassword] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const user = useUser()
  const hideJob = useHideJob()

  const isHidden = Boolean(job?.hidden)
  const isOperator = user?.role === "OPERATOR"

  // Reset sensitive fields each time the dialog opens (adjust during render instead of setState-in-effect)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPassword("")
      setAdminEmail("")
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!job) return

    if (!password.trim()) {
      toast.error("Informe a senha de administrador.")
      return
    }

    try {
      const res = await hideJob.mutateAsync({
        id: job.id,
        hidden: !isHidden,
        password: password.trim(),
        adminEmail: adminEmail.trim() || undefined,
      })
      toast.success(res.message || (isHidden ? "Job restaurado com sucesso!" : "Job ocultado com sucesso!"))
      onOpenChange(false)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao alterar visibilidade do job. Verifique a senha."
      toast.error(message)
    }
  }

  if (!job) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isHidden ? (
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                <RiEyeLine className="w-5 h-5" />
              </div>
            ) : (
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <RiEyeOffLine className="w-5 h-5" />
              </div>
            )}
            <div>
              <DialogTitle className="text-base font-semibold">
                {isHidden ? "Restaurar Job na Listagem" : "Ocultar Job da Listagem"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isHidden
                  ? "Este job voltará a ser exibido normalmente na tabela."
                  : "O job será ocultado da tabela para usuários comuns, mantendo o estoque debitado."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Card com detalhes do job */}
          <div className="rounded-lg border border-gray-100 bg-muted/30 p-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Job:</span>
              <span className="font-medium text-gray-900 line-clamp-1 max-w-[220px] text-right" title={job.jobName}>
                {job.jobName}
              </span>
            </div>
            {job.osNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">OS:</span>
                <span className="font-semibold text-gray-800">{job.osNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Impressão:</span>
              <span>{formatBRT(job.printEndDate)}</span>
            </div>
            {job.mediaType && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mídia:</span>
                <span className="text-right max-w-[200px] truncate">{job.mediaType}</span>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-gray-100 text-[11px]">
              <span className="text-muted-foreground">Status do Estoque:</span>
              <span className={job.stockDeducted ? "text-emerald-700 font-medium" : "text-amber-700 font-medium"}>
                {job.stockDeducted ? "✓ Debitado (permanecerá debitado)" : "Não debitado"}
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-blue-50/70 border border-blue-100 p-2.5 flex items-start gap-2 text-xs text-blue-800">
            <RiShieldCheckLine className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Apenas <strong>Administradores</strong> e <strong>Dev Master</strong> possuem permissão para {isHidden ? "restaurar" : "ocultar"} jobs. Confirme a senha abaixo.
            </span>
          </div>

          {isOperator && (
            <div className="space-y-1.5">
              <Label htmlFor="adminEmail" className="text-xs">
                E-mail do Administrador <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="admin@empresa.com"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="adminPassword" className="text-xs flex items-center gap-1.5">
              <RiLockPasswordLine className="w-3.5 h-3.5 text-muted-foreground" />
              Senha de Administrador <span className="text-red-500">*</span>
            </Label>
            <Input
              id="adminPassword"
              type="password"
              placeholder="Digite a senha para autorizar"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-9 text-xs"
              autoFocus
              required
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={hideJob.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              variant={isHidden ? "default" : "destructive"}
              disabled={hideJob.isPending || !password}
              className="gap-1.5"
            >
              {hideJob.isPending && <Spinner className="size-3.5" />}
              {isHidden ? "Confirmar e Restaurar" : "Confirmar e Ocultar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
