'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RiPrinterLine, RiStackLine, RiDropLine, RiChat3Line, RiSettings4Line, RiLayoutGridLine } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Image from 'next/image';
import { useNotifications } from '@/lib/queries/notifications';
import { useStockItems } from '@/lib/queries/stock';
import { useContacts } from '@/lib/queries/messages';

export function SidebarRail() {
  const pathname = usePathname();
  const { data: notifications } = useNotifications();
  const { data: stockItems } = useStockItems();
  const { data: contacts } = useContacts();

  const pendingNotifs = notifications?.filter((n) => !n.acknowledgedAt) ?? [];
  const lowStockCount = stockItems?.filter((i) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK').length ?? 0;
  const stockBadge = pendingNotifs.length > 0 ? String(pendingNotifs.length) : lowStockCount > 0 ? String(lowStockCount) : null;
  const chatBadge = contacts?.find((c) => c.id === 'system')?.unreadCount ?? 0;
  const chatBadgeStr = chatBadge > 0 ? String(chatBadge) : null;

  const navItems = [
    { label: 'Máquinas', icon: RiPrinterLine, href: '/maquinas', badge: null },
    { label: 'Produtos', icon: RiLayoutGridLine, href: '/produtos', badge: null },
    { label: 'Estoque de Mídias', icon: RiStackLine, href: '/estoque', badge: stockBadge },
    { label: 'Tintas & Química', icon: RiDropLine, href: '/tintas', badge: null },
    { label: 'Chat Interno', icon: RiChat3Line, href: '/chat', badge: chatBadgeStr },
  ];

  return (
    <TooltipProvider delay={0}>
      <aside className="w-18 h-full bg-background flex flex-col items-center py-3 justify-between select-none z-30 shrink-0">
        
        {/* Topo - Home & Setores */}
        <div className="flex flex-col items-center gap-3 w-full">
          {/* Logo da Gráfica */}
          <Tooltip>
            <TooltipTrigger>
              <Link href="/" className="relative group w-12 h-12 bg-[#522582] rounded-md flex items-center justify-center transition-all duration-200">
              <Image src="/assets/logo-64x64.png" alt="GráficaOS" width={48} height={48} className="w-10 h-10 rounded-full" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-black text-white font-semibold">
              GráficaOS — Visão Geral
            </TooltipContent>
          </Tooltip>

          <div className="w-8 h-0.5 bg-gray-100 rounded my-1" />

          {/* Ícones dos Setores */}
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Tooltip key={item.href}>
              <TooltipTrigger>
                <Link
                  href={item.href}
                  className={`relative group w-12 h-12 flex items-center justify-center transition-all duration-200 rounded-md hover:rounded-lg ${
                      isActive
                        ? 'bg-primary text-white rounded-md'
                        : 'bg-gray-100 hover:bg-gray-400 text-gray-400 hover:text-gray-50'
                    }`}
                  >
                    <Icon className="w-6 h-6" />
                    {item.badge && (
                      <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#1e1f22]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-black text-white font-semibold">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Rodapé - Configurações */}
        <Tooltip>
          <TooltipTrigger>
            <Link href="/config" className="w-12 h-12 bg-gray-100 hover:bg-gray-400 text-gray-400 hover:text-white rounded-[24px] hover:rounded-[16px] flex items-center justify-center transition-all">
              <RiSettings4Line className="w-6 h-6" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" className="bg-black text-white font-semibold">
            Configurações da Estação
          </TooltipContent>
        </Tooltip>

      </aside>
    </TooltipProvider>
  );
}