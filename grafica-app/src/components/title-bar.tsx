'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Home, Bell, Search, Minus, Square, Copy, X } from 'lucide-react';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { NotificationPanel } from '@/components/notification-panel';
import { AboutDialog } from '@/components/about-dialog';
import { useSidebarStore } from '@/components/navigation/sidebar-store';
import { clearSession, clearUser } from '@/lib/api';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export function TitleBar() {
  const router = useRouter();
  const isElectron = useSyncExternalStore(
    () => () => {},
    () => typeof window.grafica?.quit === 'function',
    () => false
  );
  const sidebarVisible = useSidebarStore((state) => state.sidebarVisible);
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
  const [winState, setWinState] = useState({ isFullScreen: false, isMaximized: false });
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (typeof window.grafica?.isMaximized === 'function') {
      window.grafica.isMaximized().then((value) => {
        if (mounted) setWinState((s) => ({ ...s, isMaximized: value }));
      });
    }
    if (typeof window.grafica?.isFullScreen === 'function') {
      window.grafica.isFullScreen().then((value) => {
        if (mounted) setWinState((s) => ({ ...s, isFullScreen: value }));
      });
    }
    const unsubscribe = window.grafica?.onWindowState?.((state) => {
      if (mounted) setWinState(state);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  function handleLogout() {
    clearUser();
    clearSession();
    router.replace('/auth');
  }

  function handleQuit() {
    window.grafica?.quit();
  }

  const zoomButtons = isElectron
    ? [
        { label: 'Aumentar zoom', onClick: () => window.grafica?.zoom({ delta: 0.5 }) },
        { label: 'Diminuir zoom', onClick: () => window.grafica?.zoom({ delta: -0.5 }) },
        { label: 'Redefinir zoom', onClick: () => window.grafica?.zoom({ level: 0 }) },
      ]
    : [];

  return (
    <>
      <header
        className="flex h-11 w-full shrink-0 items-center justify-between bg-white text-zinc-600 select-none border-b border-zinc-200"
        style={dragStyle}
      >
        <div className="flex h-full items-center px-3">
          <div
            className="flex h-8 w-8 items-center justify-center mr-3 relative"
            style={noDragStyle}
          >
            <Image
              src="/logo-32x32.png"
              alt="Logo do Sistema"
              fill
              className="object-contain rounded-md"
              draggable={false}
            />
          </div>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex h-full items-center justify-center px-2 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
            style={noDragStyle}
            aria-label="Início"
          >
            <Home className="h-4 w-4" />
          </button>

          <div className="mx-2 h-4 w-[1px] bg-zinc-300" />

          <nav className="hidden md:flex h-full">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full items-center px-2.5 text-[13px] font-medium hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    style={noDragStyle}
                  >
                    Arquivo
                  </button>
                }
              />
              <DropdownMenuContent align="start" sideOffset={0}>
                <DropdownMenuItem onClick={handleLogout}>Sair da conta</DropdownMenuItem>
                {isElectron && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleQuit}>Fechar o app</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full items-center px-2.5 text-[13px] font-medium hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    style={noDragStyle}
                  >
                    Editar
                  </button>
                }
              />
              <DropdownMenuContent align="start" sideOffset={0}>
                <DropdownMenuItem disabled>Recortar</DropdownMenuItem>
                <DropdownMenuItem disabled>Copiar</DropdownMenuItem>
                <DropdownMenuItem disabled>Colar</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full items-center px-2.5 text-[13px] font-medium hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    style={noDragStyle}
                  >
                    Exibir
                  </button>
                }
              />
              <DropdownMenuContent align="start" sideOffset={0}>
                <DropdownMenuCheckboxItem
                  checked={sidebarVisible}
                  onCheckedChange={() => toggleSidebar()}
                >
                  Alternar barra lateral
                </DropdownMenuCheckboxItem>
                {zoomButtons.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {zoomButtons.map((item) => (
                      <DropdownMenuItem key={item.label} onClick={item.onClick}>
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full items-center px-2.5 text-[13px] font-medium hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    style={noDragStyle}
                  >
                    Janela
                  </button>
                }
              />
              {isElectron && (
                <DropdownMenuContent align="start" sideOffset={0}>
                  <DropdownMenuItem onClick={() => window.grafica?.minimize()}>
                    Minimizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.grafica?.maximize()}>
                    Maximizar / Restaurar
                  </DropdownMenuItem>
                  <DropdownMenuCheckboxItem
                    checked={winState.isFullScreen}
                    onCheckedChange={(checked) => window.grafica?.setFullScreen(Boolean(checked))}
                  >
                    Tela cheia
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleQuit}>Fechar</DropdownMenuItem>
                </DropdownMenuContent>
              )}
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className="flex h-full items-center px-2.5 text-[13px] font-medium hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                    style={noDragStyle}
                  >
                    Ajuda
                  </button>
                }
              />
              <DropdownMenuContent align="start" sideOffset={0}>
                <DropdownMenuItem onClick={() => setAboutOpen(true)}>
                  Sobre o GráficaOS
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>

        <div className="flex h-full items-center">
          <div className="flex items-center gap-1 px-2">
            <NotificationPanel
              trigger={
                <button
                  type="button"
                  className="relative p-1.5 hover:bg-zinc-100 hover:text-zinc-900 rounded transition-colors"
                  style={noDragStyle}
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1 right-1.5 h-2 w-2 rounded-full bg-red-500 border-2 border-white" />
                </button>
              }
            />

            <button
              type="button"
              onClick={() => router.push('/produtos?foco=1')}
              className="p-1.5 hover:bg-zinc-100 hover:text-zinc-900 rounded transition-colors mr-1"
              style={noDragStyle}
              aria-label="Buscar"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>

          <div className="h-4 w-[1px] bg-zinc-300 mr-1" />

          <div className="flex h-full">
            <button
              type="button"
              className="flex h-full w-[46px] items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-colors"
              style={noDragStyle}
              onClick={() => window.grafica?.minimize()}
              aria-label="Minimizar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-full w-[46px] items-center justify-center hover:bg-zinc-200 hover:text-zinc-900 transition-colors"
              style={noDragStyle}
              onClick={() => window.grafica?.maximize()}
              aria-label={winState.isMaximized ? 'Restaurar' : 'Maximizar'}
            >
              {winState.isMaximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="flex h-full w-[46px] items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
              style={noDragStyle}
              onClick={() => window.grafica?.quit()}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </>
  );
}