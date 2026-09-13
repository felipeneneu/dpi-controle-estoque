# Plano: Chat DM + Comandos + IA + Estabilidade Accurio

## Objetivo
Transformar o chat em sistema de DMs (como Discord), adicionar comandos em tempo real, simular IA monitoramento 24/7 e corrigir instabilidade da Accurio.

---

## Tarefas

### 1. Chat DM — Mensagens privadas entre usuários
**Problema:** Chat atual é apenas canal público "#geral".

**Solução:**
- Sidebar com lista de usuários (como Discord)
- Botão (+) para iniciar conversa com usuário selecionado
- Sala = `dm:{userId1}:{userId2}` (ordenado para consistência)
- Mostrar data da conversa (como WhatsApp: "Hoje", "Ontem", "12/09/2026")
- Manter canal #geral para comunicação geral

**Arquivos:**
- `grafica-app/backend/src/db/schema.ts` — Adicionar `recipientId` na tabela `messages`
- `grafica-app/backend/src/routes/chat.ts` — Endpoint `GET /api/messages/dm/:userId`
- `grafica-app/src/app/(dashboard)/chat/page.tsx` — Reestruturar com sidebar
- `grafica-app/src/lib/queries/messages.ts` — Hook `useDmMessages`

**Verificar:** Clicar usuário → chat abre → mensagens privadas → data aparece.

---

### 2. Sidebar do Chat — Lista de usuários
**Solução:**
- Card lateral com lista de todos os usuários cadastrados
- Botão (+) no topo para novo chat
- Indicador de online/offline (baseado em Socket.IO)
- Preview da última mensagem (como WhatsApp)
- Badge de não lidas

**Arquivos:**
- `grafica-app/src/components/chat-sidebar.tsx` — Novo componente
- `grafica-app/backend/src/routes/chat.ts` — Endpoint `GET /api/chat/contacts`

---

### 3. Comandos no Chat — /help, /status, /estoque
**Solução:**
- Parser de mensagens que detecta prefixo `/`
- Comandos:
  - `/help` — Lista comandos disponíveis
  - `/status` — Status de todas as máquinas (online/offline, toner)
  - `/estoque` — Resumo do estoque (itens baixos, zerados)
  - `/jobs` — Últimos 5 jobs processados
  - `/alertas` — Notificações ativas
- Resposta vai apenas para o usuário que executou (não para o chat)

**Arquivos:**
- `grafica-app/backend/src/lib/chat-commands.ts` — Novo: registry + handlers
- `grafica-app/backend/src/routes/chat.ts` — Processar comandos antes de salvar

**Verificar:** Digitar `/help` → resposta privada com lista de comandos.

---

### 4. IA Monitor — "Cérebro" do sistema
**Solução:**
- Background agent que monitora 24/7:
  - Estoque baixo/zerado → alerta automático no chat
  - Máquina offline → notifica usuário responsável
  - Jobs com erro → reporta no chat
  - Toner baixo → avisa para repor
- Posts automáticos no canal #geral quando há eventos importantes
- Resumo diário às 8h (opcional)

**Arquivos:**
- `grafica-app/backend/src/agents/brain/index.ts` — Novo: monitor loop
- `grafica-app/backend/src/agents/brain/alerts.ts` — Lógica de alertas
- `grafica-app/backend/src/server.ts` — Iniciar brain agent

**Verificar:** Estoque baixo → mensagem automática no chat "⚠️ Estoque baixo: Couché 33x48 150g".

---

### 5. Estabilidade Accurio — Corrigir problemas
**Problemas identificados:**
1. Retry de sessão apenas 1 vez
2. Sem circuit breaker
3. Erros silenciosos (sem log)
4. Telemetria + jobs sequenciais (lento)
5. Sem alerta quando máquina fica offline

**Soluções:**
- Retry exponencial (3 tentativas)
- Circuit breaker: após 5 falhas, pausar 10min
- Log de erros no console + Socket.IO
- Telemetria e jobs em paralelo
- Evento `machine:offline` quando detecta queda

**Arquivos:**
- `grafica-app/backend/src/agents/konica/fetcher.ts` — Retry exponencial
- `grafica-app/backend/src/agents/konica/index.ts` — Circuit breaker + paralelo

**Verificar:** Desligar máquina → alerta em 30s → reconectar → retoma normal.

---

## Concluído quando
- [ ] Chat tem sidebar com lista de usuários
- [ ] DMs funcionam entre usuários
- [ ] Data da conversa aparece (como WhatsApp)
- [ ] Comandos /help, /status, /estoque funcionam
- [ ] IA posta alertas automáticos no chat
- [ ] Accurio não perde sessão frequentemente
- [ ] Alerta de máquina offline chega via chat
