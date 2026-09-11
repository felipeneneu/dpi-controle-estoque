import { Suspense } from "react";
import { SidebarRail } from '@/components/navigation/sidebar-rail';
import { SubSidebar } from '@/components/navigation/sub-sidebar';
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
    <div className="w-screen h-screen max-w-[1920px] max-h-270 overflow-hidden flex bg-background select-none">
      {/* 1. Rail de Ícones Vertical (72px) */}
      <SidebarRail />

      {/* 2. Sub-menu do Setor + Perfil do Operador (240px) */}
      <Suspense fallback={null}>
        <SubSidebar />
      </Suspense>


      {/* 3. Área Conteúdo Principal (Produtos / Dashboard) */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto p-8 bg-background">
        <div className="flex justify-end mb-4 items-center gap-2">
          <NotificationPanel />
          <ConnectionStatusBadge />
        </div>
        {children}
      </div>

      <NotificationsProvider />
      <EscapeActionsMenu />
    </div>
  );
}