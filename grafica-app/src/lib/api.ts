const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function backendUrl(): string {
  return BACKEND_URL;
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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  userId: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  content: string;
  senderId: string;
  senderName?: string | null;
  createdAt: string;
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
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  createdAt: string;
  itemIds: string[];
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
