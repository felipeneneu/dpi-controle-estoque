"use client";

import { create } from "zustand";

type SidebarState = {
  sidebarVisible: boolean;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;
};

export const useSidebarStore = create<SidebarState>((set) => ({
  sidebarVisible: true,
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
}));