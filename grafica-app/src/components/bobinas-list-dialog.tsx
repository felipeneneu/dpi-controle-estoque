import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StockItem } from "@/lib/api";
import { useBobinas } from "@/lib/queries/stock";
import { Badge } from "@/components/ui/badge";

export function BobinasListDialog({
  item,
  onClose,
}: {
  item: StockItem | null;
  onClose: () => void;
}) {
  const query = useBobinas(item?.id);
  const bobinas = query.data ?? [];

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bobinas: {item?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : bobinas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma bobina encontrada para este item.</p>
          ) : (
            <div className="grid gap-4">
              {bobinas.map((b) => (
                <div key={b.id} className="p-4 border rounded-xl flex items-center justify-between">
                  <div>
                    <p className="font-bold">ID Curto / Serial: {b.serial}</p>
                    <p className="text-sm text-muted-foreground">Localização: {b.location}</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={b.state === "IN_USE" ? "default" : b.state === "USED" ? "destructive" : "secondary"}>
                      {b.state === "IN_USE" ? "Em Uso" : b.state === "USED" ? "Usada" : "Nova"}
                    </Badge>
                    <p className="text-sm mt-1">{b.metersRemaining}m restantes</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
