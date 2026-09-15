export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: () => [...userKeys.lists()] as const,
  photos: () => [...userKeys.all, "photos"] as const,
}

export const stockKeys = {
  all: ["stock"] as const,
  lists: () => [...stockKeys.all, "list"] as const,
  list: () => [...stockKeys.lists()] as const,
  category: (category?: string) => [...stockKeys.lists(), category ?? "all"] as const,
  detail: (id: string) => [...stockKeys.all, "detail", id] as const,
  transactions: () => [...stockKeys.all, "transactions"] as const,
  bobinas: (stockItemId?: string) => [...stockKeys.all, "bobinas", stockItemId || "all"] as const,
  garrafas: (stockItemId?: string) => [...stockKeys.all, "garrafas", stockItemId || "all"] as const,
}

export const machineKeys = {
  all: ["machines"] as const,
  lists: () => [...machineKeys.all, "list"] as const,
  list: () => [...machineKeys.lists()] as const,
  detail: (id: string) => [...machineKeys.all, "detail", id] as const,
  telemetry: (id: string) => [...machineKeys.all, "telemetry", id] as const,
}

export const supplierKeys = {
  all: ["suppliers"] as const,
  lists: () => [...supplierKeys.all, "list"] as const,
  list: () => [...supplierKeys.lists()] as const,
}

export const messageKeys = {
  all: ["messages"] as const,
  lists: () => [...messageKeys.all, "list"] as const,
  list: (room: string) => [...messageKeys.lists(), room] as const,
  dm: (recipientId: string) => [...messageKeys.all, "dm", recipientId] as const,
  contacts: () => [...messageKeys.all, "contacts"] as const,
}

export const whatsappKeys = {
  status: () => ["whatsapp", "status"] as const,
  groups: () => ["whatsapp", "groups"] as const,
  recipients: () => ["whatsapp", "recipients"] as const,
}

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
}

export const reportKeys = {
  all: ["reports"] as const,
  consumption: (machineId: string, month: string) =>
    [...reportKeys.all, "consumption", machineId, month] as const,
}

export const jobKeys = {
  all: ["jobs"] as const,
  lists: () => [...jobKeys.all, "list"] as const,
  list: (filters: { machineId?: string; month?: string; monthScope?: string; q?: string; page?: number; pageSize?: number }) =>
    [...jobKeys.lists(), filters] as const,
  detail: (id: string) => [...jobKeys.all, "detail", id] as const,
}

export const mimakiKeys = {
  all: ["mimaki"] as const,
  jobs: () => [...mimakiKeys.all, "jobs"] as const,
  jobList: (filters?: { status?: string; machine_id?: string }) =>
    [...mimakiKeys.jobs(), filters] as const,
  jobDetail: (id?: string) => [...mimakiKeys.jobs(), "detail", id ?? ""] as const,
}

export const mimakiTestKeys = {
  all: ["mimaki-test"] as const,
  list: () => [...mimakiTestKeys.all, "list"] as const,
  health: () => [...mimakiTestKeys.all, "health"] as const,
}