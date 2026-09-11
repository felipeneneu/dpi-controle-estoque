# Plano: Corrigir logout do WhatsApp e gerar novo QR

---

## Status: PLANO / AGUARDANDO APROVAÇÃO

---

## 1. Diagnóstico (Causa Raiz)

**Bug:** ao clicar em "Encerrar sessão" no `whatsapp-panel.tsx`, o toast diz que a sessão foi encerrada, mas o WhatsApp continua conectado — e nenhum QR novo é gerado.

**Causa raiz em `grafica-app/backend/src/lib/whatsapp.ts`:**

| # | Problema | Código |
|---|----------|--------|
| P1 | `logoutWhatsApp()` usa `sock.end(new Error('logout'))` — fecha o socket local, mas **não** envia logout ao WhatsApp nem apaga a sessão persistida em `wa_auth/` (centenas de arquivos pre-key/creds/session) | `lib/whatsapp.ts:179-189` |
| P2 | O handler `connection.update` recebe `close` **sem** `statusCode === loggedOut` (o erro passado é `Error` plano, sem `output.statusCode`). Por isso o estado vira `close` e **agenda reconexão automática em 3s** | `lib/whatsapp.ts:144-158` |
| P3 | A reconexão (`createSocket()`) carrega as creds salvas de `wa_auth/` → reconecta a sessão antiga **sem emitir QR** | `lib/whatsapp.ts:109-123` |
| P4 | Mesmo num logout real (statusCode 401), o handler apenas seta `logged_out` e **retorna sem reiniciar o socket** → nunca emite QR novo | `lib/whatsapp.ts:148-151` |

**Fluxo atual (errado):**
```
logoutWhatsApp()
  └─ sock.end(Error)
       └─ connection.update { connection:'close', statusCode: undefined }
            ├─ connectionState = 'close'
            └─ setTimeout(createSocket, 3000)
                 └─ wa_auth tem creds → reconecta sessão → estado 'open' (sem QR)
```

**Fluxo desejado:**
```
logoutWhatsApp()
  ├─ sock.logout() → notifica WhatsApp (revoga sessão no celular)
  ├─ espera socket fechar
  ├─ apaga wa_auth/ (creds, keys)
  ├─ connectionState = 'logged_out'
  ├─ qrCurrent = null
  └─ createSocket() imediato (wa_auth vazio → Baileys emite QR)
```

---

## 2. Mudanças Necessárias

### Arquivo principal: `grafica-app/backend/src/lib/whatsapp.ts`

- **`logoutWhatsApp()`**: substituir `sock.end(Error)` por:
  1. `await sock?.logout()` (com `try/catch` + fallback `sock.end()` se falhar).
  2. Aguardar o fechamento real da conexão (evento `connection === 'close'` ou timeout ~5s).
  3. Limpar o diretório `wa_auth/` (deletar conteúdo, recriar vazio).
  4. `connectionState = 'logged_out'`, `qrCurrent = null`.
  5. `createSocket()` **imediatamente** para emitir QR novo.
- **Handler `connection.update`**: no caso `logged_out` (statusCode `DisconnectReason.loggedOut`), também garantir limpeza da pasta e reinício (evita ficar preso em `logged_out` sem QR quando o logout vem de fora / outro dispositivo).
- **Guard contra reescrita de creds**: após `sock.end`/`logout`, o socket antigo pode disparar `creds.update` e regravar arquivos. Usar um token/flag `socketGeneration` (incrementar a cada `createSocket()`) para que callbacks de instâncias antigas sejam ignorados e não sobrescrevam a sessão limpa.
- **Evitar timers duplicados de reconexão**: um `reconnectTimer` único por módulo (a reconexão programada deve verificar se já há socket ativo em pareamento).
- **TRATAMENTO DA FILA**: `QUEUE` deve continuar intacta — mensagens pendentes são enviadas após novo pareamento (flushQueue já cuida disso).

### Arquivo secundário: `grafica-app/src/components/whatsapp-panel.tsx`

- Melhorar feedback de estado `logged_out`: mostrar texto "Sessão encerrada. Escaneie o novo QR abaixo." (o QR já aparece via polling de `/status`).
- Considerar botão sempre visível de **"Encerrar sessão"** (hoje só aparece quando `connected`) — ou, no estado `logged_out`, um botão **"Conectar"** que chama endpoint de reinício como fallback manual (opcional, baixa prioridade).

### Arquivo de rotas: `grafica-app/backend/src/routes/whatsapp.ts`

- Sem mudança obrigatória (o endpoint `POST /api/whatsapp/logout` já expõe `logoutWhatsApp()`).
- **Opcional:** adicionar endpoint `POST /api/whatsapp/reconnect` para reiniciar o pareamento manualmente sem depender de auto-restart.

### Testes: `grafica-app/backend/tests/`

- Não existe teste de WhatsApp. Como Baileys depende de rede, priorizar:
  - Teste unitário do fluxo de logout com `sock` **mockado** (verificar que `sock.logout()` é chamado, `wa_auth` é limpo, `createSocket()` é agendado).
  - Teste do handler `connection.update` (mock de evento) cobrindo: `open`, `close` sem statusCode, `close` com `loggedOut`, e presença de `qr`.
  - Expor hooks testáveis (funções internas exportadas sob `__test__` ou injeção de dependências) se necessário.

---

## 3. Quebra de Tarefas

| Fase | Tarefa | Arquivos | Agente |
|------|--------|----------|--------|
| **1** | Refatorar `lib/whatsapp.ts`: flag de geração do socket + timer único + `logoutWhatsApp()` real (logout → aguardar fechamento → limpar `wa_auth` → `logged_out` → `createSocket()` imediato) | `backend/src/lib/whatsapp.ts` | backend-specialist |
| **2** | Ajustar handler `connection.update` para o caso `loggedOut` (limpar + reiniciar para emitir QR) | `backend/src/lib/whatsapp.ts` | backend-specialist |
| **3** | Atualizar `whatsapp-panel.tsx`: feedback de `logged_out`, exibir/forçar QR novo, botão de conectar/disconectar coerente com novo estado | `grafica-app/src/components/whatsapp-panel.tsx` | frontend-specialist |
| **4** | Testes unitários com Baileys mockado (logout chama `sock.logout`, limpa auth dir, agenda restart; handler `connection.update` cobre `open/close/logged_out/qr`) | `backend/tests/**` | test-engineer |
| **5** | (Opcional) Endpoint `POST /api/whatsapp/reconnect` + botão manual no painel | `backend/src/routes/whatsapp.ts`, `whatsapp-panel.tsx` | backend-specialist + frontend-specialist |
| **6** | Verificação E2E manual: encerrar sessão → QR novo aparece em ≤5s → escanear → conectado | App Electron | — |

**Dependências:** Fase 1 → 2 → 3; Fase 4 depende de 1 e 2; Fase 5 opcional após 3; Fase 6 após 3.

---

## 4. Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|:----------:|-----------|
| `sock.logout()` travar se a rede cair durante o logout | Média | Timeout (~5s) + fallback `sock.end()` + limpeza local mesmo assim |
| Socket antigo regravar creds após limpar `wa_auth` (race no `creds.update`) | Alta | Flag `socketGeneration` — callbacks de instância antiga são ignorados; só a instância nova escreve |
| Duas `createSocket` concorrentes (auto-reconnect + novo restart) | Média | Timer único de reconexão + guard `connectionState` |
| Baileys recusar pareamento imediato (rate limit do WhatsApp) | Baixa | Retry com backoff (5s) no `connection.update`/erro |
| Testes com rede real flakiness | Média | Baileys 100% mockado; nenhum teste toca rede |

---

## 5. Critérios de Sucesso (Verificação)

- [ ] `POST /api/whatsapp/logout` deixa `GET /api/whatsapp/status` com `connected: false` e `state: "logged_out"`.
- [ ] `wa_auth/` fica vazio (ou apenas recriado) após logout.
- [ ] Novo QR (`status.qr`) aparece em **≤5s** após o logout, sem interação do usuário.
- [ ] Celular mostra o dispositivo removido de "Aparelhos conectados" (se `sock.logout()` usado).
- [ ] Escanear o novo QR conecta normalmente e os alertas voltam a funcionar.
- [ ] Mensagens enfileiradas (QUEUE) são enviadas após reconectar.
- [ ] Testes unitários passam (`npm run test` no backend).
- [ ] Lint/typecheck passam (`npm run lint`, `npm run typecheck`).
- [ ] Reino de reconexão automática (2 sockets) não ocorre — monitorar logs.

---

## 6. Fora de Escopo (posteridades)

- Migração do auth para Better Auth (plano separado: `docs/PLAN-better-auth.md`).
- WhatsApp Business API / multi-WhatsApp.
- Envio de mídia (imagens/doc) nos alertas.
- Uso da flag `GRAFICA_DISABLE_WHATSAPP` (existe no teste mas não é respeitada no módulo — deIXAR para outro plano).