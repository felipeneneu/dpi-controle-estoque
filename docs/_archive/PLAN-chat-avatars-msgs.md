# Plano: Correção do Chat — Avatares, Delay e Atualização em Tempo Real

## Fase 0 — Contexto (Já Coletado)

Três problemas relatados pelo usuário no chat:

1. **Avatares não aparecem** nas mensagens de outros usuários.
2. **Delay perceptível** ao carregar/enviar mensagens.
3. **Nova mensagem não surge no chat** — só aparece ao sair e voltar da tela.

### Causas raiz (investigação concluída)

**Bug 1 — Avatares:** a infraestrutura funciona (arquivos em `grafica-app/public/users`, estático `/users/`, helper `avatarUrl()`, `/api/user-photos`), mas o chat não a usa:
- `ChatMessage` não tem campo `avatar` (`src/lib/api.ts:140-147`).
- Backend GET/POST de mensagens não seleciona `users.avatar` (`backend/src/routes/chat.ts:48-63, 95-101`).
- A UI do chat só renderiza `AvatarFallback` com iniciais (`src/app/(dashboard)/chat/page.tsx:105-109`), nunca `<AvatarImage>`.

**Bug 2 — Delay:**
- Envio **sem otimismo**: aguarda o POST + refetch da lista completa de 200 mensagens (`messages.ts:14-20`, `chat/page.tsx:69-79`).
- `staleTime: 30s` (`query-client.ts:8`) faz a tela exibir lista velha por até 30s ao voltar.
- Sem `refetchInterval` (sem fallback de polling).

**Bug 3 — Mensagem só aparece ao voltar:**
- O socket é um **singleton compartilhado** (`src/lib/socket.ts`) que já está conectado quando a tela de chat abre (layout monta consumidores antes: `layout.tsx:28-34`, `notifications-provider.tsx`).
- O `chat:join "geral"` só é emitido **dentro do evento `"connect"`** (`chat/page.tsx:53`), que já disparou e não dispara de novo → o cliente **nunca entra na sala** `geral`.
- Backend só faz broadcast para quem está na sala (`app.ts:145-154`, `chat.ts:101`), então `chat:message` nunca chega.
- A única via de atualização vira o refetch por remontagem + staleTime excedido → exatamente o comportamento "sai e volta".

### Decisões do usuário (Socratic Gate)

- **Bug 3:** `join` ativo e automático (emit join no mount + no connect/reauth; leave no unmount).
- **Bug 2:** envio otimista + broadcast (append local imediato + invalidação).
- **Segurança:** incluir polling leve (`refetchInterval`) e reduzir/ajustar `staleTime` no chat.

---

## Fase 1 — Tarefas (Breakdown por área)

### T1. Backend: expor avatar nas mensagens
- **Arquivos:** `grafica-app/backend/src/routes/chat.ts`
- **Fazer:**
  - No `GET /api/messages`: incluir `users.avatar` no `select`, renomear para `senderAvatar` no payload.
  - No `POST /api/messages`: incluir `senderAvatar: sender?.avatar` no payload emitido via `chat:message`.
  - Materializar o `senderAvatar` como **URL** (via `avatarUrl()`) ou devolver o `path` cru e deixar o frontend montar com `avatarUrl()` (consistente com o resto, ver exemplo `sub-sidebar.tsx:79`). Recomenda-se devolver o `path` cru e usar `avatarUrl()` no frontend.
- **Verificação:** `GET /api/messages?room=geral` retorna cada item com `senderAvatar`.

### T2. Frontend: tipo `ChatMessage` com avatar
- **Arquivo:** `grafica-app/src/lib/api.ts`
- **Fazer:** adicionar `senderAvatar?: string | null` ao `interface ChatMessage`.

### T3. Frontend: renderizar avatar na mensagem
- **Arquivo:** `grafica-app/src/app/(dashboard)/chat/page.tsx` (bloco 100-119)
- **Fazer:** para mensagens de outros (`!mine`), se `m.senderAvatar` existir, renderizar `<AvatarImage src={avatarUrl(m.senderAvatar)} />`; caso contrário, manter `<AvatarFallback>` com iniciais. Importar `ApiImage`/`AvatarImage` e `avatarUrl`.
- **Verificação:** avatares do `felipeneneu.jfif`, `gustavo.jpeg`, `vlademir.png` aparecem ao entrar com usuários que têm avatar definido.

### T4. Frontend: corrigir join/leave da sala no socket
- **Arquivo:** `grafica-app/src/app/(dashboard)/chat/page.tsx` (useEffect 44-67)
- **Fazer:**
  - Função `join()`: se `socket.connected` emitir `chat:join "geral"` imediatamente; também registrar handler `socket.on("connect", join)` (cobre reconnect/reauth) e chamar `join()` no mount.
  - Em `onMessage`: manusear via `setLive` (já existe) + scroll.
  - No unmount: `socket.emit("chat:leave", "geral")`; `socket.off("connect", join)`; `socket.off("chat:message", onMessage)`.
- **Verificação (manual):** abrir o chat, enviar mensagem de outro usuário em outra janela → aparece em tempo real, sem trocar de tela.

### T5. Frontend: envio otimista
- **Arquivos:** `grafica-app/src/lib/queries/messages.ts` (mutation), `chat/page.tsx:69-79`
- **Fazer:** no envio, prepender otimisticamente uma `ChatMessage` local à lista (com `id` temporário, `senderId` do usuário atual, `content`, `createdAt: new Date().toISOString()`); limpar após sucesso real do POST. Usar `onMutate` para precahcer cache OU manter estado local `sent` no page e reconciliar com `history`/`live`. Manter `invalidateQueries` no `onSuccess`.
- **Verificação:** a mensagem do autor aparece na hora (sem esperar o round-trip).

### T6. Frontend: polling de segurança + staleTime do chat
- **Arquivo:** `grafica-app/src/lib/queries/messages.ts` (`useMessages`)
- **Fazer:** adicionar `refetchInterval: 10_000` (ou valor escolhido) na query com `refetchIntervalInBackground: false`. Opcional: passar `staleTime` menor (ex.: `5_000`) somente nessa query, sem afetar o default global.
- **Verificação:** com o socket de chat propositalmente indisponível, uma mensagem nova aparece por polling em ≤10s.

### T7. Ordenação estável por `createdAt`
- **Arquivo:** `grafica-app/src/app/(dashboard)/chat/page.tsx` (useMemo 32-42)
- **Fazer:** após dedup, **ordenar por `createdAt`** em vez de "histórico primeiro, live depois". Trata chegada fora de ordem.
- **Verificação:** mensagens sempre em ordem cronológica, mesmo com broadcast/refetch intercalados.

---

## Fase 2 — Atribuições de Agentes (sugestão)

| Tarefa | Agente | Razão |
|--------|--------|-------|
| T1 (backend chat) | `backend-specialist` | Alterar rota + payload socket |
| T2, T3, T5, T7 (frontend chat/UI) | `frontend-specialist` | Tipo, render, otimismo, ordenação |
| T4 (socket join) | `frontend-specialist` | Lógica de socket client + lifecycle |
| T6 (query/polling) | `frontend-specialist` | react-query config |

> T1 e T2 compartilham o contrato `senderAvatar`; devem ser feitas em conjunto (backend define o campo, frontend consome). Recomenda-se começar por T1→T2→T3 e, em paralelo, T4; depois T5, T6, T7.

---

## Fase 3 — Verificação (Checklist)

1. [ ] `npm run build:backend` (tsc) passa — `grafica-app/backend`.
2. [ ] Frontend `npm run lint` + `npm run build` (export) passam.
3. [ ] Backend: `GET /api/messages?room=geral` retorna `senderAvatar` por item.
4. [ ] Backend: todos os testes de backend passam (45/45) — `npm --prefix grafica-app/backend test`.
5. [ ] Manual: navegar até o chat e ver os 3 avatares dos usuários com avatar.
6. [ ] Manual (bug 3): em duas janelas/usuários, uma mensagem nova aparece **em tempo real**, sem sair e voltar.
7. [ ] Manual (delay): ao enviar, a própria mensagem aparece **imediatamente** (otimista).
8. [ ] Manual (polling): desligar temporariamente o socket de chat → mensagem nova chega em ≤10s via refetch.
9. [ ] Manual: mensagens em ordem cronológica mesmo fora de ordem.

---

## Fase 4 — Pós-implantação

- Reempacotar **Client** e **Server** (`npm run package:client`, `npm run package:server`) com as alterações de `grafica-app`, pois o `out/` (build de export) e o backend `dist` vão mudar.
- Relembrar: `grafica-app/backend` muda → `package:server` sincroniza o `staging/backend` (etapa que copia `dist`, `drizzle`, `.env`, `node_modules`). Garantir que o build de backend rode antes do package.
- Registrar nova costela de risco: chat depende de socket pronto; documentar a regra "sempre emitir `chat:join`(connected) e `chat:leave`(unmount)" para evitar regressão.