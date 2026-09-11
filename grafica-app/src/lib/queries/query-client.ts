import { QueryClient } from "@tanstack/react-query"

export const defaultStaleTime = 30_000

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: defaultStaleTime,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
})

export function queryErrorMessage(err: unknown, fallback = "Algo deu errado"): string {
  if (err instanceof Error && err.message) return err.message
  return fallback
}