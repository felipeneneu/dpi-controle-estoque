# 🏗️ High-Level System Design (HLD)

---

### Arquitetura Geral do Sistema (Offline-First com Turso)

```text
 💻 Computador 1 (Servidor Local LAN / PC Balcão)
 ├── Electron Client (.exe)
 └── Backend Node.js (Porta 3001)
      ├── API Fastify + Socket.io + Cron
      └── Turso Client (Drizzle ORM)
             │
             ├── Local Embedded Replica Sync ──┐
             ▼                                  ▼
 📂 local-replica.db (SQLite)        ☁️ Turso Cloud Database (LibSQL)
                                                ▲
             ┌──────────────────────────────────┘
             │ (Sincronização Cloud via HTTPS)
             ▼
 💻 Computadores 2 e 3 (Produção / Admin)
 └── Electron Client (.exe) ──► Conecta no Turso / Node Local
```

### Protocolos de Comunicação
- **Interno Electron -> Node.js**: HTTP/REST + WebSockets na porta 3001.
- **Node.js -> Turso Cloud**: LibSQL protocolo sobre HTTPS/WebSockets.
