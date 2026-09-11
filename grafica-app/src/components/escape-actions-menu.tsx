"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearSession, clearUser } from "@/lib/api";
import {
  RiArrowRightLine,
  RiCloseLine,
  RiLogoutBoxRLine,
  RiShutDownLine,
} from "@remixicon/react";

type Panel = "menu" | "confirm-logout" | "confirm-quit" | null;

const OVERLAY_SELECTOR =
  '[data-slot="dialog-content"], [data-slot="dropdown-menu-content"]';

type EscapeActionsMenuProps = {
  /**
   * "full" mostra "Sair" e "Fechar o app" (dashboard).
   * "quit-only" mostra apenas "Fechar o app" (tela de login, sem sessão).
   */
  mode?: "full" | "quit-only";
};

export function EscapeActionsMenu({ mode = "full" }: EscapeActionsMenuProps) {
  const router = useRouter();
  const isElectron = useSyncExternalStore(
    () => () => {},
    () => typeof window.grafica?.quit === "function",
    () => false
  );
  const [panel, setPanelState] = useState<Panel>(null);
  const panelRef = useRef<Panel>(null);

  function setPanel(next: Panel) {
    panelRef.current = next;
    setPanelState(next);
  }

  useEffect(() => {
    if (!isElectron) return;

    // Gerenciamos o ESC manualmente (abrir/fechar). O stopImmediatePropagation
    // impede que o mesmo keydown chegue ao useDismiss do base-ui, que fecharia
    // o dialog logo após abrir (era a causa do "piscar").
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      const otherOverlay = document.querySelector(OVERLAY_SELECTOR);
      const isOwnOpen = panelRef.current !== null;

      if (isOwnOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPanel(null);
        return;
      }

      if (otherOverlay) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPanel("menu");
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isElectron]);

  if (!isElectron) return null;

  function handleQuit() {
    window.grafica
      ?.quit()
      .then(() => setPanel(null))
      .catch(() => setPanel(null));
  }

  function handleLogout() {
    clearUser();
    clearSession();
    setPanel(null);
    router.replace("/auth");
  }

  return (
    <Dialog
      open={panel !== null}
      onOpenChange={(open) => {
        if (!open) setPanel(null);
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        {panel === "confirm-logout" && (
          <>
            <DialogHeader>
              <DialogTitle>Sair do app</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja sair? Você precisará entrar novamente para
                continuar.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPanel("menu")}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleLogout}>
                <span>Sair</span>
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </DialogFooter>
          </>
        )}

        {panel === "confirm-quit" && (
          <>
            <DialogHeader>
              <DialogTitle>Fechar o app</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja fechar o app? O servidor local também será
                encerrado.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPanel("menu")}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleQuit}>
                <span>Fechar</span>
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </DialogFooter>
          </>
        )}

        {panel === "menu" && (
          <>
            <DialogHeader>
              <DialogTitle>O que deseja fazer?</DialogTitle>
              <DialogDescription>
                Use o teclado (ESC) ou o mouse para escolher uma ação.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2">
              {mode === "full" && (
                <Button
                  variant="outline"
                  size="lg"
                  className="justify-between px-4 font-semibold"
                  onClick={() => setPanel("confirm-logout")}
                >
                  <span className="flex items-center gap-2">
                    <RiLogoutBoxRLine className="size-5" />
                    Sair
                  </span>
                  <RiArrowRightLine data-icon="inline-end" />
                </Button>
              )}
              <Button
                variant="outline"
                size="lg"
                className="justify-between px-4 font-semibold"
                onClick={() => setPanel("confirm-quit")}
              >
                <span className="flex items-center gap-2">
                  <RiShutDownLine className="size-5" />
                  Fechar o app
                </span>
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="justify-between px-4 font-semibold"
                onClick={() => setPanel(null)}
              >
                <span className="flex items-center gap-2">
                  <RiCloseLine className="size-5" />
                  Cancelar
                </span>
                <RiArrowRightLine data-icon="inline-end" />
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}