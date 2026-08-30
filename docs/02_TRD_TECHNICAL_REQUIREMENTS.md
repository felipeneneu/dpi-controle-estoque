# ⚙️ Technical Requirements Document (TRD)

---

### 1. Stack Tecnológica
- **Frontend / Desktop Shell**: Next.js 16 (App Router com `output: 'export'`), Tailwind CSS v4, Shadcn UI (`base-maia` style / `zinc` palette), Remixicon (`@remixicon/react`), Electron.
- **Backend / Services**: Node.js (Fastify) + `node-cron` + `p-queue` + Socket.io.
- **Banco de Dados & ORM**: Turso (LibSQL com Embedded Replicas) + Drizzle ORM.
- **Comunicação inter-máquinas**: Fastify REST / tRPC + WebSockets (Socket.io) via porta 3001 na LAN.

### 2. Requisitos de Infraestrutura & Rede
- **Modo Serverless / Edge**: Turso Cloud Database (`libsql://...`) como mestre de sincronização.
- **Modo Offline**: Réplica em arquivo `.db` SQLite local em cada máquina cliente.
