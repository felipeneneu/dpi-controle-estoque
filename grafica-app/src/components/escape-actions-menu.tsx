"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

export function EscapeActionsMenu() {
  const router = useRouter();
  const isElectron = useSyncExternalStore(
    () => () => {},
    () => typeof window.grafica?.quit === "function",
    () => false
  );
  const [panel, setPanel] = useState<Panel>(null);

  useEffect(() => {
    if (!isElectron) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector(OVERLAY_SELECTOR)) return;
      event.preventDefault();
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