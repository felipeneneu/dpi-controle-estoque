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

### 3. Integração Mimaki (M2M)
- **Endpoint M2M**: `POST /api/integrations/mimaki/jobs` — autenticação via `X-API-Secret` ou `Bearer` token.
- **Endpoint de Vinculação**: `POST /api/integrations/mimaki/jobs/:id/bind-material` — autenticação JWT (usuário logado).
- **Cálculo de Mídia**: `length_meters = (height_mm × pages × quantity_units) / 1000`.
- **Status do Material**: `BOUND` (vinculado automaticamente) ou `PENDING_BIND` (requer vinculação manual).
- **Evento Socket.IO**: `mimaki:unmatched_material` emitido para sala `estoque` quando material não identificado.
- **Secret M2M**: Configurável via variável de ambiente `MIMAKI_INTEGRATION_SECRET` ou tabela `settings`.

### 4. Privacidade do Chat Bot
- Respostas de comandos (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) são enviadas como DM para o remetente.
- Mensagens do bot são armazenadas em sala `dm:system:<userId>` (não na sala original).

### 5. Notificações em Tempo Real
- Badge dinâmico no sidebar de Estoque (contagem real de notificações não lidas).
- Evento `notification:new` via Socket.IO para atualização instantânea.
