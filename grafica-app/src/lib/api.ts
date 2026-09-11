const BACKEND_URL_KEY = "grafica_backend_url";
const DEFAULT_BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function backendUrl(): string {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(BACKEND_URL_KEY);
    if (saved) return saved.replace(/\/+$/, "");
  }
  return DEFAULT_BACKEND_URL;
}

export function setBackendUrl(url: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(BACKEND_URL_KEY, url.replace(/\/+$/, ""));
  window.dispatchEvent(new CustomEvent("grafica:backend-url"));
}

export function avatarUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${backendUrl()}${path}`;
  return path;
}

const TOKEN_KEY = "grafica_token";
const USER_KEY = "grafica_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function setUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
}) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent("grafica:user"));
}

export function clearUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent("grafica:user"));
}

export function getUser(): {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string | null;
} | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
}

/**
 * Valida o token JWT armazenado fazendo uma requisição leve ao backend.
 * Retorna true se o token for válido, false caso contrário.
 * Limpa a sessão automaticamente se o token estiver expirado/inválido.
 */
export async function validateToken(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${backendUrl()}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return true;
    clearSession();
    return false;
  } catch {
    clearSession();
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const reqHeaders: Record<string, string> = {};
  if (options.body) {
    reqHeaders["Content-Type"] = "application/json";
  }
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${backendUrl()}${path}`, {
    ...options,
    headers: {
      ...reqHeaders,
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const errBody = body as { error?: string; message?: string };
    const message = errBody?.error || errBody?.message || "Erro na requisição";
    throw new ApiError(res.status, message);
  }

  return body as T;
}

export type StockCategory = "PAPER_MEDIA" | "INK_SUPPLY" | "OTHER";
export type StockStatus = "AVAILABLE" | "LOW_STOCK" | "OUT_OF_STOCK";

export interface StockItem {
  id: string;
  name: string;
  category: StockCategory;
  subType: string | null;
  unit: string;
  width: number | null;
  code: string | null;
  label: string | null;
  currentQuantity: number;
  minQuantity: number;
  imageUrl: string | null;
  status: StockStatus;
  createdAt: string;
  machineIds: string[];
}

export interface StockTransaction {
  id: string;
  itemId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  quantity: number;
  reason: string | null;
  userId?: string | null;
  userName?: string | null;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  recipientId?: string | null;
  content: string;
  senderId: string;
  senderName?: string | null;
  senderAvatar?: string | null;
  createdAt: string;
  isCommand?: boolean;
}

export interface ChatContact {
  id: string;
  name: string;
  avatar?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  type: string;
  read: boolean;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}

export interface UserPhoto {
  name: string;
  url: string;
}

export interface Machine {
  id: string;
  name: string;
  brand: string;
  model: string;
  technology: string;
  imageUrl: string | null;
  ip: string | null;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  createdAt: string;
  itemIds: string[];
  telemetry?: MachineTelemetry | null;
}

export interface InkChannel {
  color: "C" | "LC" | "M" | "LM" | "Y" | "K" | "OP";
  sku: string;
  remainingMl: number;
  capacityMl: number;
  status: string;
}

export interface KonicaTray {
  trayId: string;
  paperName: string;
  paperAmount: number;
  targetPaperSize: string;
  mediaType: string;
  mediaWeight: string;
}

/** Detecta a AccurioPrint (Laser / Konica) para renderizar painéis específicos. */
export function isKonicaMachine(m: Pick<Machine, "brand" | "technology">): boolean {
  return /konica|accurio/i.test(m.brand) || m.technology === "Laser";
}

export interface MachineTelemetry {
  machineId: string;
  online: boolean;
  statusSeverity?: string;
  statusMessage?: string;
  mediaName?: string;
  mediaWidthMm?: number;
  inkCyanMl?: number;
  inkLightCyanMl?: number;
  inkMagentaMl?: number;
  inkLightMagentaMl?: number;
  inkYellowMl?: number;
  inkBlackMl?: number;
  inkOptimizerMl?: number;
  inkCapacityMl?: number;
  maintenanceCartridgePct?: number;
  kit1Pct?: number;
  kit2Pct?: number;
  kit3Pct?: number;
  tonerCyanPct?: number;
  tonerMagentaPct?: number;
  tonerYellowPct?: number;
  tonerBlackPct?: number;
  wasteTonerLevel?: string;
  trays?: KonicaTray[];
  createdAt?: string;
  live?: {
    online: boolean;
    statusSeverity?: string;
    statusMessage?: string;
    mediaName?: string;
    mediaWidthMm?: number;
    inks?: InkChannel[];
    capacityMl?: number;
    maintenanceCartridgePct?: number;
    kit1Pct?: number;
    kit2Pct?: number;
    kit3Pct?: number;
    tonerCyanPct?: number;
    tonerMagentaPct?: number;
    tonerYellowPct?: number;
    tonerBlackPct?: number;
    wasteTonerLevel?: string;
    trays?: KonicaTray[];
  };
}

export const CATEGORY_LABEL: Record<StockCategory, string> = {
  PAPER_MEDIA: "Mídia",
  INK_SUPPLY: "Tinta",
  OTHER: "Outro",
};

export const UNIT_LABEL: Record<string, string> = {
  m: "m",
  fls: "fls",
  ml: "ml",
  L: "L",
};
