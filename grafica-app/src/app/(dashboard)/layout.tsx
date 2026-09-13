import { Suspense } from "react";
import { TitleBar } from '@/components/title-bar';
import { SidebarContainer } from '@/components/navigation/sidebar-container';
import { NotificationsProvider } from '@/components/notifications-provider';
import { NotificationPanel } from '@/components/notification-panel';
import { EscapeActionsMenu } from '@/components/escape-actions-menu';
import { ConnectionStatusBadge } from '@/components/connection-status';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col w-screen h-screen max-w-[1920px] max-h-270 overflow-hidden bg-white select-none">
      {/* Barra superior de 44px (h-11) */}
      <TitleBar />

      {/* O resto do sistema usa a altura restante (calc(100vh - 44px)) */}
      <div className="flex h-[calc(100vh-44px)] w-full">
        {/* Coluna esquerda (rail + sub-menu do setor) — ocultável via Exibir → Alternar */}
        <SidebarContainer />

        {/* Área Conteúdo Principal (Produtos / Dashboard) */}
        <main className="flex-1 flex flex-col overflow-y-auto p-8">
          <div className="flex justify-end mb-4 items-center gap-2">
            <NotificationPanel />
            <ConnectionStatusBadge />
          </div>
          {children}
        </main>
      </div>

      <NotificationsProvider />
      <EscapeActionsMenu />
    </div>
  );
}