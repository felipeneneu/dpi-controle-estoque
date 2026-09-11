import { io, type Socket } from "socket.io-client";
import { backendUrl, getToken } from "./api";

let socket: Socket | null = null;
let listener: (() => void) | null = null;

function connect(): Socket {
  if (socket) disconnect();
  socket = io(backendUrl(), {
    transports: ["websocket", "polling"],
    auth: { token: getToken() },
  });
  return socket;
}

function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function ensureListener() {
  if (typeof window === "undefined") return;
  if (listener) return;
  listener = () => {
    disconnect();
    connect();
  };
  window.addEventListener("grafica:backend-url", listener);
}

/**
 * Obtém o socket compartilhado da aplicação. Reconecta automaticamente quando a
 * URL do backend muda (evento grafica:backend-url) — assim API e Socket.IO usam
 * sempre o MESMO host (backendUrl()).
 */
export function getSocket(): Socket {
  ensureListener();
  return socket ?? connect();
}
