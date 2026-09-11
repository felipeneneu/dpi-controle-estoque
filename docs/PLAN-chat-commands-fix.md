# Plano: Comandos Chat — Autocomplete + Correção /help

## Objetivo
Corrigir comandos no chat (que não funcionam) e adicionar autocomplete ao digitar `/`.

---

## Problemas Identificados

| # | Bug | Arquivo | Linha |
|---|-----|---------|-------|
| 1 | Resposta vai para sala errada (self-DM) | `chat.ts` | 236-238 |
| 2 | Comando não é salvo no banco | `chat.ts` | 217-244 |
| 3 | Interface `ChatMessage` sem campo `isCommand` | `api.ts` | 163-172 |
| 4 | Sem renderização para mensagens de bot | `page.tsx` | 152-184 |
| 5 | Markdown não é renderizado (negrito, código) | `BubbleContent` | — |

---

## Tarefas

### 1. Corrigir Socket.IO — resposta vai para sala correta
**Problema:** Respostas de comandos são emitidas para `dm:{userId}:{userId}` (sala self), mas o client está na sala `geral` ou `dm:{userId}:{contactId}`.

**Solução:** Emitir resposta para a sala onde o usuário está (`room`), não para self-DM.

**Arquivo:** `grafica-app/backend/src/routes/chat.ts`

**Verificar:** Digitar `/help` → resposta aparece no chat.

---

### 2. Salvar comandos no banco
**Problema:** Quando detecta comando, o código retorna antes de `db.insert()`. O texto do comando some ao re-fetch.

**Solução:** Inserir tanto a mensagem do usuário quanto a resposta do bot no banco antes de retornar.

**Arquivo:** `grafica-app/backend/src/routes/chat.ts`

**Verificar:** Após enviar `/help`, recarregar página → comando e resposta ainda aparecem.

---

### 3. Adicionar campo `isCommand` na interface
**Solução:** Adicionar `isCommand?: boolean` na interface `ChatMessage` do frontend.

**Arquivo:** `grafica-app/src/lib/api.ts`

---

### 4. Renderizar mensagens de bot com estilo diferente
**Solução:** Detectar `senderId === 'system'` ou `isCommand === true` e renderizar com:
- Avatar diferente (ícone de robô ou logo)
- Fundo diferenciado (ex: borda azul clara)
- Nome "GraficaOS Bot"

**Arquivo:** `grafica-app/src/app/(dashboard)/chat/page.tsx`

---

### 5. Autocomplete de comandos
**Solução:** Quando o usuário digita `/`, mostrar dropdown com comandos disponíveis:
- Detectar se `draft` começa com `/`
- Filtrar comandos conforme digita (ex: `/he` → mostra `/help`)
- Selecionar com Enter ou clique
- Mostrar descrição de cada comando

**Arquivos:**
- `grafica-app/src/app/(dashboard)/chat/page.tsx` — lógica do dropdown
- `grafica-app/backend/src/lib/chat-commands.ts` — exportar lista de comandos para o frontend

**Verificar:** Digitar `/` → dropdown aparece → digitar `he` → filtra para `/help` → Enter seleciona.

---

### 6. Listar comandos via API (opcional)
**Solução:** Endpoint `GET /api/chat/commands` retorna comandos disponíveis para o frontend usar no autocomplete.

**Arquivo:** `grafica-app/backend/src/routes/chat.ts`

---

## Concluído quando
- [ ] `/help` mostra resposta no chat
- [ ] Comando e resposta são salvos no banco
- [ ] Mensagens de bot têm visual diferenciado
- [ ] Autocomplete aparece ao digitar `/`
- [ ] Filtragem por texto funciona
- [ ] Seleção por Enter ou clique funciona
