"use client"

import * as React from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "@/lib/queries/query-client"

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}