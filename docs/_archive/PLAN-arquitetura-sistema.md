# PLAN — Arquitetura do Sistema GraficaOS (foco: comunicação entre máquinas/PCs)

> **Solicitação do usuário:** gerar um `.md` da arquitetura do sistema — de tudo que o
> sistema faz e deixa de fazer — para o usuário **verificar no Claude** como resolver o
> problema de **comunicação entre as máquinas**.
>
> **Esclarecimento do usuário (Socratic Gate):**
> - "Máquinas" = **PCs/equipamentos via rede (LAN)** — a comunicação PC-para-PC dentro da
>   rede local (um servidor, vários clientes), **não** integração com impressoras físicas.
> - Objetivo do documento = **Arquitetura completa ATUAL + lacunas (gaps)**, com ênfase em
>   comunicação, para diagnóstico.

---

## Fase 0 — Contexto descoberto (análise do estado atual)

### Volumes de contato / stack
| Camada | Tecnologia | Onde |
|--------|-----------|------|
| Frontend | Next.js 16 (static export) + React 19 + Tailwind v4 + shadcn | `grafica-app/src` |
| Backend | Fastify 5 + Drizzle ORM + Turso/LibSQL (SQLite local) | `grafica-app/backend/src` |
| Realtime | Socket.IO (HTTP server do Fastify) | `backend/src/app.ts` |
| Shell desktop | Electron (server/client dual-mode) | `electron/` |
| Banco | Tabelas: users, machines, machine_items, stock_items, stock_transactions, suppliers, messages, notifications, settings | `backend/src/db/schema.ts` |

### Como a comunicação entre "máquinas"/PCs funciona hoje (linha a linha)
1. **PC1 (Server)** roda o backend Fastify em `0.0.0.0:3001` (`backend/src/server.ts`),
   embutido no Electron (`electron/main.js:61-96` — spawna `node dist/server.js`).
2. **PC2/3/4 (Client)** instalam o instalador Client (só UI) e apontam a URL do backend
   para `http://<IP-do-PC1>:3001` via **Configurações → Conexão com o Backend**
   (`config/page.tsx:270-330`). A URL fica no `localStorage` (`grafica_backend_url`
   em `lib/api.ts:1-16`).
3. **Conexão HTTP/API:** todas as chamadas REST passam por `api()` (`lib/api.ts:87-110`),
   que monta `fetch(`${backendUrl()}${path}`)` com `Authorization: Bearer`. `backendUrl()`
   lê o `localStorage` e cai em `http://localhost:3001` se nada estiver salvo.
4. **CORS:** o backend aceita `origin` restrita via callback (`app.ts:25-35`) — por padrão
   `app://`, `app://.`, `localhost:3001`, `127.0.0.1:3001`, ou a lista de `CORS_ORIGINS`.
   **Este é um ponto crítico de falha**: qualquer origem diferente dessas é bloqueada.
5. **Realtime (Socket.IO):** autenticado por JWT no handshake (`app.ts:128-142`), usado
   **apenas** para:
   - Chat humano em salas `geral/estoque/producao` (`chat:join/leave/message`) — `app.ts:144-153`
   - Notificações de estoque / atualização de estoque (`notification:new`, `stock:updated`)
   - Consumido por `notifications-provider.tsx` e `chat/page.tsx`.
   - **Não há** comunicação Socket.IO/telnet/MQTT/serial com equipamento físico.
6. **Descobrimento de IP:** `electron/main.js:39-50` (`lanAddresses`) expõe IPs via bridge
   `window.grafica.net()`; `config/page.tsx` mostra a faixa verde com URLs prontas.

### O que o sistema FAZ (resumo funcional)
- CRUD de estoque (itens, transações IN/OUT/AJUSTE) com status automático (AVAILABLE /
  LOW_STOCK / OUT_OF_STOCK).
- Cadastro de "máquinas" como **catálogo** (nome, marca, modelo, tecnologia, status
  manual) + **vínculo N:N** máquina↔item de estoque (`machine_items`).
- Alertas de estoque baixo (notificação in-app + WhatsApp via Baileys).
- Chat interno em tempo real (Socket.IO).
- RBAC (DEV_MASTER / ADMIN / OPERATOR) com JWT.
- Multi-PC na LAN (1 servidor + N clientes), com teste de conexão (`/health`).
- Fornecedores, usuários, relatórios de movimentação.

### O que o sistema NÃO faz (lacunas — gap do problema de comunicação)
- **Não comunica com equipamento físico de impressão/corte** (sem MQTT, serial, IPP, TCP,
  telemetria, comando de máquina). `machines` não tem campo de IP/porta/conexão.
- **Não deduz estoque automaticamente** ao rodar um trabalho de impressão.
- **Não gerencia jobs/produção/fila de impressão.**
- **Não monitora status em tempo real** das máquinas (status é manual).
- **Não tem sincronização offline/offline-first** entre réplicas locais (TRD menciona, não existe).
- Sem cron/agendamento de alertas (07:35/17:30 citados no FRD, não implementados).
- Sem leitor de código de barras/QR; sem custo/preço; sem indicador real de presença online.

---

## Fase 1 — Objetivo e variáveis da solução

**Entregável desta tarefa:** `docs/PLAN-arquitetura-sistema.md` (este plano) + o documento de
arquitetura a ser gerado, que deverá ser usado para análise no Claude.

A causa mais provável do "problema de comunicação entre as máquinas" a investigar no Claude
é o **fluxo de conexão PC→PC** descrito na Fase 0, com ênfase nos pontos de falha:

1. Firewall do PC1 bloqueando a porta `3001` (sintoma: `ERR_CONNECTION_REFUSED`).
2. IP errado / PCs em sub-redes diferentes (`ERR_CONNECTION_TIMED_OUT`).
3. **CORS** bloqueando origem — p.ex. quando o client usa `http://192.168.x.x:3001` e a
   origem não está na allowlist (sintoma: login/API falham, "origin not allowed").
4. **Socket.IO** conectando em `localhost` em vez do IP do servidor (chat realtime não emite).
5. URL do backend com barra/trailing ou protocolo errado.

---

## Fase 2 — Plano de execução (task breakdown)

### Tarefa A — Produzir o documento de arquitetura (`.md`)
Criar `docs/14_ARQUITETURA_SISTEMA_COMUNICACAO.md` cobrindo:
- [ ] Diagrama da topologia LAN (PC1 server + PC2-4 clientes).
- [ ] Fluxo de comunicação: inicialização, descoberta de IP, escolha da URL, handshake
      HTTP/API (JWT), handshake Socket.IO.
- [ ] Camadas e componentes (frontend, backend, socket, electron, banco) com caminhos de arquivo.
- [ ] Tabela de rotas da API + eventos Socket.IO.
- [ ] Modelo de dados (todas as tabelas, com foco em `machines`/`machine_items`).
- [ ] **Seção "Tudo que o sistema faz"** (checklist).
- [ ] **Seção "Tudo que o sistema deixa de fazer" (gaps)** — foco na comunicação entre máquinas.
- [ ] **Seção "Pontos de falha da comunicação PC↔PC"** com diagnóstico de cada sintoma.

### Tarefa A2 — Documento de WhatsApp / alertas (.md)
- [x] Criar `docs/15_WHATSAPP_ALERTAS_ARQUITETURA.md` (fluxo atual, "1 número apenas",
      sem grupo, alerta interno vs WhatsApp, lacunas + decisões D1-D5 a avaliar no Claude).

### Tarefa B — Entregar p/ análise no Claude
- [ ] Garantir que o `.md` seja autocontido e referencie o caminho dos arquivos-chave
      (api.ts, app.ts, main.js, config/page.tsx, notifications-provider.tsx, schema.ts).

### Tarefa C — Verificação
- [ ] Documento criado em `docs/` seguindo a numeração da pasta.
- [ ] Nenhum código de aplicação foi alterado (modo PLAN apenas).

---

## Fase 3 — Critérios de sucesso / aceite

- [ ] O usuário entende **como a comunicação entre as máquinas (PCs) funciona hoje**.
- [ ] O usuário identifica **o que falta / o que está quebrado** na comunicação.
- [ ] O `.md` pode ser colado no Claude para gerar uma solução/proposta de correção.

---

## Próximos passos (fora deste plano de documentação)
- Revisar o documento de arquitetura.
- Rodar `/create` para implementar a **solução de comunicação** que o Claude propor.
- (Opcional, futuro) Decidir se o sistema deve também integrar **máquinas físicas**
  (isto mudaria a arquitetura de comunicação para MQTT/agentes — hoje **não** existe).
