"use client";

import { Suspense } from "react";
import { SidebarRail } from "@/components/navigation/sidebar-rail";
import { SubSidebar } from "@/components/navigation/sub-sidebar";
import { useSidebarStore } from "@/components/navigation/sidebar-store";

export function SidebarContainer() {
  const sidebarVisible = useSidebarStore((state) => state.sidebarVisible);

  if (!sidebarVisible) return null;

  return (
    <>
      <SidebarRail />

      <Suspense fallback={null}>
        <SubSidebar />
      </Suspense>
    </>
  );
}