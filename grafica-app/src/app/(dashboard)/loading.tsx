export default function DashboardLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center py-32">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}
