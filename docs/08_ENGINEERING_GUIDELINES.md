# 🛠️ Engineering Guidelines

---

### 1. Padrões de Código
- **TypeScript Strict Mode**: Tipagem estática obrigatória para todas as entidades e endpoints.
- **Components UI**: Padrão Shadcn UI (`zinc` palette), sem bibliotecas de CSS conflitantes. Utilizar ícones do `@remixicon/react`.
- **Validation**: Validação de schemas no frontend e backend utilizando `zod`.

### 2. Fluxo de Commits & Git
- Siga o padrão *Conventional Commits*:
  - `feat:` Novas funcionalidades.
  - `fix:` Correção de bugs.
  - `docs:` Alterações de documentação.
  - `refactor:` Ajustes de código sem alteração de regra de negócio.

### 3. Ciclo de Vida do Socket do Chat (anti-regressão)
O socket é um **singleton compartilhado** (`grafica-app/src/lib/socket.ts`) já conectado
quando a tela de chat abre. O backend só faz broadcast de `chat:message` para quem **está
na sala** (`chat:join`). Regra obrigatória ao mexer no chat:

- **Sempre emitir `chat:join`** quando conectado — no *mount* **e** no evento `connect`
  (cobre reconnect/reauth). Nunca emitir `join` apenas dentro do handler de `connect`
  (o `connect` já disparou antes do mount → o cliente nunca entra na sala).
- **Sempre emitir `chat:leave` e remover os handlers** (`connect`, `chat:message`) no *unmount*.
- Manter um `refetchInterval` (polling) na query de mensagens como fallback de segurança
  quando o socket estiver indisponível.
- **Dependência:** o chat depende de socket pronto. Sem o `join` ativo o broadcast nunca
  chega, e a única via de atualização viraria o refetch por remontagem (comportamento
  "sai e volta"). Consultar `docs/PLAN-chat-avatars-msgs.md` para o contexto completo.

### 4. Padrões de Integração Mimaki
- **Endpoint M2M**: `POST /api/integrations/mimaki/jobs` usa middleware `m2mAuth` (X-API-Secret ou Bearer).
- **Endpoint de Vinculação**: `POST /api/integrations/mimaki/jobs/:id/bind-material` usa middleware `authenticate` (JWT).
- **Cálculo de Mídia**: `length_meters = (height_mm × pages × quantity_units) / 1000` — sempre em metros lineares.
- **Busca de Material**: `LIKE` case-insensitive no campo `name` da tabela `stock_items` (categoria `PAPER_MEDIA`).
- **Status do Material**: `BOUND` (auto-deduzido) ou `PENDING_BIND` (requer vinculação manual).
- **Evento Socket.IO**: `mimaki:unmatched_material` emitido para sala `estoque` quando material não identificado.

### 5. Privacidade do Chat Bot
- Respostas de comandos (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) são armazenadas em sala `dm:system:<userId>`.
- Emissão via Socket.IO: `app.io.to('user:<senderId>').emit('chat:message', botMsg)`.
- Mensagens do bot têm `senderId: 'system'` e `senderName: 'GraficaOS Bot'`.
- Campo `isCommand: true` identifica respostas de bot no frontend.
