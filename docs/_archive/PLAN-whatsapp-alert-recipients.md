# PLAN — Melhorar alertas WhatsApp (GraficaOS)

## Objetivo

Tornar os alertas automáticos de estoque (via Baileys) resilientes a indisponibilidade de
uma única pessoa. Hoje o envio depende de `settings.whatsapp.phone`. A mudança adiciona:

1. Seleção de grupo (`@g.us`) reutilizável pelo painel (buscar grupos → salvar `groupId`).
2. Múltiplos destinatários individuais (tabela `whatsapp_recipients`) como complemento.
3. Envio com prioridade: grupo primeiro, individuais em sequência com espaçamento (~1-2s).
4. Escalonamento: alerta crítico (`OUT_OF_STOCK`) sem confirmação em X min (default 15)
   é reenviado automaticamente.

**Decisões do Socratic Gate (usuário):**
- Envio ao grupo **entrar na fila** quando offline (generalizar fila para JIDs `@g.us`) — consistente com o fluxo atual de destinatário único.
- Guardar `itemId` + **texto completo da mensagem** na notificação, para o resend não depender do item ainda existir.
- UI de confirmação: **lista de notificações no painel + botão "Confirmar"** (hoje só existe toast Sonner).

## Contexto técnico verificado

- `grafica-app/backend/src/lib/whatsapp.ts`: `sock` é privado do módulo; fila `QUEUE` é
  `Array<{ phone, text }>` e o flush monta `${phone}@s.whatsapp.net` — não suporta `@g.us`.
  `sendWhatsApp(phone, text)` é orientado a telefone. `getDestinationPhone()` lê `whatsapp.phone`.
- `grafica-app/backend/src/routes/stock.ts` (linhas 327-347): dispara alerta — monta mensagem
  inline, insere `notifications` + emite `notification:new`, e envia WA se `enabled` e `phone`.
- `grafica-app/backend/src/lib/settings.ts`: chave-valor (sem tipo).
- `grafica-app/backend/src/db/schema.ts`: tabelas `notifications` (sem `acknowledgedAt`),
  `settings`, `users`.
- `grafica-app/backend/src/db/index.ts`: Turso/LibSQL; migrações via `drizzle-kit generate`
  (out: `./drizzle`) aplicadas no startup (`server.ts` e `tests/helpers/app.ts`).
- `grafica-app/backend/src/routes/whatsapp.ts`: endpoints com prefixo `preHandler:
  [authenticate, authorize(['DEV_MASTER','ADMIN'])]`.
- `grafica-app/backend/src/routes/notifications.ts`: `GET /api/notifications` e
  `POST /api/notifications/:id/read` (auth, escopo por `request.userId`).
- `grafica-app/backend/src/middleware/auth.ts`: `authenticate`/`authorize`.
- `grafica-app/src/components/whatsapp-panel.tsx`: UI com hooks TanStack Query de
  `src/lib/queries/whatsapp.ts`. Montado em `config/page.tsx` (só para ADMIN/DEV_MASTER).
- `grafica-app/src/components/notifications-provider.tsx`: só exibe toast Sonner no evento
  socket `notification:new`. Não há lista/bell. O layout do painel é `src/app/(dashboard)/layout.tsx`
  com `SidebarRail` + `SubSidebar`.
- Testes backend: `tests/routes/stock.test.ts`, `tests/lib/whatsapp.test.ts`,
  `tests/helpers/app.ts` (lista `resetDb` hardcoded — precisa incluir `whatsapp_recipients`).

## Restrições (não implementar)

- **Não** criar/gerenciar grupo via API Baileys (`groupCreate`, add/remove membros) —
  grupo é mantido manualmente. Só leitura (`groupFetchAllParticipating`).
- **Não** reescrever camada de conexão/fila existente — as mudanças se somam (novas funções,
  fila generalizada para JIDs).
- **Não** implementar D5 (agendamento cron 07:35/17:30).
- Manter fallback para `settings.whatsapp.phone` quando não há grupo nem destinatários.

---

## Fase 1 — Modelo de dados + migração

**1.1.** `backend/src/db/schema.ts` — nova tabela `whatsapp_recipients`:
```
whatsapp_recipients: id (pk), phone, label, priority ('principal'|'backup'),
active (boolean, default true), createdAt (timestamp)
```
Exportar types `WhatsappRecipient` / `NewWhatsappRecipient`.

**1.2.** `notifications` — adicionar colunas nullable:
- `acknowledgedAt` (timestamp, nullable)
- `itemId` (text, nullable)
- `waMessage` (text, nullable) — texto completo da mensagem enviada (p/ resend)
- `alertLevel` (text nullable: `LOW_STOCK`|`OUT_OF_STOCK`) — p/ o job saber quem é crítico

**1.3.** Rodar `npm run db:generate` (gera migração 0001) e `npm run db:push` em dev.
Atualizar `tests/helpers/app.ts` → incluir `whatsapp_recipients` na ordem de `resetDb`
(antes de `settings`/após `notifications`; sem FK para `users`).

## Fase 2 — Backend: destinatários + grupos

**2.1.** `lib/whatsapp.ts`:
- Expor `fetchGroups()` que chama `sock.groupFetchAllParticipating()` no socket conectado
  e retorna `Array<{ id, subject }>` (lança/retorna vazio se `sock` nulo ou não `open`).
- Generalizar a fila `QUEUE` e `sendWhatsApp` para aceitar JID completo: novo
  `sendToJid(jid: string, text)` que envia direto se conectado, senão enfileira `{ jid, text }`.
  Manter `sendWhatsApp(phone, text)` como wrapper (resolve `${digits}@s.whatsapp.net`)
  para não quebrar chamadas existentes.
- `flushQueue()` passa a usar `jid` direto (sem anexar `@s.whatsapp.net`).

**2.2.** Novos helpers de resolução em `lib/whatsapp.ts` (isolados, separados da conexão):
- `resolveRecipients()`: retorna destinos a enviar, com prioridade:
  1. grupo (`settings.whatsapp.groupId` → `sendToJid`)
  2. destinatários ativos de `whatsapp_recipients` (cada um → `sendWhatsApp(phone, text)`)
  - Se não houver grupo nem registros ativos → fallback único `settings.whatsapp.phone`.
  - Retorna lista de `{ kind: 'group'|'individual', jid, phone?, label? }` para a lógica de
    envio conseguir logar por destino.
  - Ler `whatsapp.groupId` de `settings` e os destinatários do `db`.
- Nova função de envio com fila sequencial e espaçamento:
  `sendToRecipients(text, spacingMs=1500)` — grupo primeiro; depois individuais **em loop
  sequencial com `await sleep(spacingMs)` entre envios** (nunca `Promise.all`). Cada envio
  loga sucesso/falha individualmente; falha não interrompe os demais. Retorna
  `{ results: [{ ok, kind, target }] }`.

## Fase 3 — Backend: rotas de API

**3.1.** `routes/whatsapp.ts`:
- `GET /api/whatsapp/groups` — ADMIN/DEV_MASTER → `fetchGroups()` → `[{ id, subject }]`.
- Ampliar `POST /api/whatsapp/config` para aceitar `groupId` e persistir em
  `settings.whatsapp.groupId` (mantendo `phone`/`enabled` atuais).
- Novo bloco CRUD de destinatários (ADMIN/DEV_MASTER), prefixo `/api/whatsapp/recipients`:
  - `GET  /api/whatsapp/recipients` — lista
  - `POST /api/whatsapp/recipients` — criar `{ phone, label, priority, active }`
  - `PATCH /api/whatsapp/recipients/:id` — editar (incl. toggle `active`)
  - `DELETE /api/whatsapp/recipients/:id` — remover
  - Zod validators: phone obrigatório; priority enum; active boolean.

**3.2.** `routes/notifications.ts`:
- `POST /api/notifications/:id/ack` — auth; marca `acknowledgedAt = now` (escopo por usuário).
- Estender `GET /api/notifications` para incluir novos campos (`acknowledgedAt`, `itemId`,
  `alertLevel`) na response schema.

## Fase 4 — Backend: integração do disparo + escalonamento

**4.1.** `routes/stock.ts` (linhas 327-347): substituir o bloco de envio por:
- Montar a mensagem e guardar na notificação: `itemId`, `alertLevel` (status), `waMessage`.
- Se `whatsapp.enabled`, chamar `sendToRecipients(waMessage)` com os destinatários resolvidos.
- Manter o emit socket `notification:new` (toast) e o fallback de envio quando só
  `whatsapp.phone` existe.

**4.2.** Novo `lib/notification-resend.ts`:
- Exportar `startAlertEscalation()` e `stopAlertEscalation()` (setInterval simples, default
  60s de tick).
- A cada tick: buscar notificações `type='stock'` com `alertLevel='OUT_OF_STOCK'` e
  `acknowledgedAt IS NULL` e `createdAt` mais antigo que `now - akcMinutos` (default 15).
- Para cada uma: se `waMessage` existir, `sendToRecipients(waMessage)` (regrava mesma
  mensagem; não duplica notificação nem re-emite toast). Logar reenvios.
- Configurável via `settings.escalation.minutes` (default 15) — consulta com fallback.
- Registrar `startAlertEscalation()` no `server.ts` (ao lado de `startWhatsApp()`) e parar
  no shutdown.

## Fase 5 — Frontend

**5.1.** `src/lib/queries/whatsapp.ts`:
- `useWhatsAppGroups()` — GET `/api/whatsapp/groups` (enabled manual).
- Ampliar `useSaveWhatsAppConfig` para aceitar `groupId`.
- `useWhatsAppRecipients()` (list), `useCreateRecipient`, `useUpdateRecipient`,
  `useDeleteRecipient` — invalidam `whatsappKeys.recipients`.

**5.2.** `src/lib/queries/query-keys.ts` — adicionar `whatsappKeys.groups/recipients`.

**5.3.** `src/components/whatsapp-panel.tsx`:
- Seção "Grupo de alerta": botão "Buscar grupos" → `useWhatsAppGroups` → select dos grupos
  → selecionar salva `groupId` (via config). Mostrar grupo atual selecionado.
- Seção "Destinatários individuais": lista de recipients com toggle ativo + botão remover;
  formulário para adicionar (phone, label, priority). Usa os hooks de 5.1.

**5.4.** `src/lib/queries/notifications.ts` + `src/components/notification-list.tsx`:
- Hook `useNotifications()` (lista) e `useAckNotification()` (POST `/api/notifications/:id/ack`,
  invalida lista).
- `NotificationList`: lista pendentes (sem ack), botão "Confirmar" por item, montado na
  `SubSidebar` (ou painel no header do dashboard).

**5.5.** `notifications-provider.tsx`: ao receber `notification:new` com `alertLevel` crítico,
  invalidar a lista de notificações p/ refletir pendência. (opcional, baixa prioridade)

## Fase 6 — Testes + verificação

- Testes de unidade do fluxo de destinatários (`tests/lib/whatsapp.test.ts`): `resolveRecipients`
  (grupo + individuais + fallback phone), `sendToRecipients` sequencial com espaçamento, falha
  isolada por destino, `fetchGroups` (mock `sock.groupFetchAllParticipating`).
- Testes de rota (`tests/routes/notifications.test.ts`): `GET recipients`, `POST recipients`,
  `PATCH toggle`, `DELETE`, `POST /:id/ack`, e bloqueio de OPERATOR (403) em endpoints de
  recipient/grupos.
- Rodar: `npm run lint` (backend + app), `npx tsc --noEmit` (backend), e `npm run build` no
  app. Confirmar build estático 14 rotas intacto.

## Critérios de aceite

- [ ] Buscar e selecionar grupo pelo painel sem editar banco manualmente (grupo salvo em `whatsapp.groupId`).
- [ ] Alerta crítico chega no grupo E nos destinatários individuais ativos.
- [ ] Falha ao enviar a um destinatário não impede o envio aos demais (logs por destino).
- [ ] Envios em sequência com espaçamento ~1-2s, nunca `Promise.all`.
- [ ] Notificação crítica sem confirmação em 15 min é reenviada automaticamente.
- [ ] Comportamento antigo (só `whatsapp.phone`) segue funcionando sem grupo/destinatários.

## Checagem final

- Verificação manual runtime (coordenação manual com usuário):
  - Adicionar o número/Baileys ao grupo de teste (pré-requisito real do usuário) → buscar
    grupos no painel → selecionar.
  - Baixar um item para `OUT_OF_STOCK` → checar grupo + destinatários.
  - Marcar "Confirmar" na lista → verificar que o job não reenvia mais.
  - Sem grupo/destinatários cadastrados → confirmar fallback para `whatsapp.phone`.
