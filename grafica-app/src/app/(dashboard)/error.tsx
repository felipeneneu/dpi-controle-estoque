"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <p className="text-lg font-semibold text-foreground">
          Ocorreu um erro inesperado
        </p>
        <p className="text-sm text-muted-foreground">
          Tente recarregar a página. Se o problema persistir, verifique a conexão
          com o servidor.
        </p>
        <Button onClick={reset} className="h-11 rounded-xl font-semibold">
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
