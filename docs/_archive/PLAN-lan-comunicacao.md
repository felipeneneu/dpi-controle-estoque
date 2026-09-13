# PLAN — Solução de comunicação LAN (GraficaOS)

> **Objetivo:** eliminar a digitação manual de IP, tornar a conexão PC-servidor ↔
> PC-clientes resiliente a mudança de IP/rede, mantendo o fallback manual.
>
> **Escopo:** descoberta automática (UDP broadcast), CORS por faixa privada, unificar URL
> API/Socket.IO, liberar firewall, health-check com retry + status visível.
> **Fora de escopo:** RBAC, schema de banco, estoque, impressoras físicas (v2+).

---

## Fase -1 — Diagnóstico confirmado (o que existe hoje)

| Ponto | Estado atual | Arquivo |
|-------|--------------|---------|
| URL backend | `localStorage['grafica_backend_url']`, fallback `http://localhost:3001` | `grafica-app/src/lib/api.ts:1-16` |
| Campo manual | Config → "Conexão com o Backend", salva e recarrega | `config/page.tsx:270-330` |
| CORS | allowlist fixa: `app://`, `app://.`, `localhost:3001`, `127.0.0.1:3001`, `CORS_ORIGINS` | `backend/src/app.ts:25-35` |
| Socket.IO | `notifications-provider.tsx:14` e `chat/page.tsx:44` já usam `backendUrl()` (OK) | 2 arquivos |
| Comando firewall | não existe | — |
| Health | `/health` retorna `{status:'ok'}` | `app.ts:115` |
| Bridge Electron | `window.grafica.net()/info()/quit()` via `ipcMain.handle` | `electron/main.js:191-205` |
| Rede do backend | `0.0.0.0:PORT` (default 3001) | `backend/src/server.ts:19` |

**Já confirmado / positivo:** o Socket.IO já usa `backendUrl()` nos 2 pontos (tarefa 3
principalmente é *proteção contra regressão* + reconexão dinâmica). O `backendUrl()` já é
a única fonte de verdade.

**Risco técnico resolvido pelo usuário:** mDNS/Bonjour não é nativo no Windows → foi
descartado. **Decisão: descoberta via UDP broadcast PRÓPRIO** (dgram nativo do Node), sem
dependência externa e sem scan sequencial.

---

## Fase 0 — Perguntas de esclarecimento (Socratic Gate)

Decisões **já fechadas com o usuário**:

1. **D1 — Descoberta = UDP broadcast próprio** (descartado mDNS e scan sequencial):
   - **Servidor:** abre socket UDP com `dgram` nativo do Node, escuta na porta **41234**;
     ao receber a string `"GRAFICAOS_DISCOVER"`, responde com JSON `{name, ip, port}`.
   - **Cliente:** envia broadcast `"GRAFICAOS_DISCOVER"` para `255.255.255.255:41234`,
     espera resposta por **2-3s** e usa o IP que respondeu.
   - **Fallback manual:** se não achar em 3s, mostra campo para digitar o IP.
2. **D2 — Porta:** usar **3001 por padrão** e **respeitar `PORT`** quando configurada.
   Firewall e descoberta usam a porta efetiva.
3. **D3 — Conexão/status na tela de login:** como o login **depende** de estar conectado,
   o indicador de status + configuração devem ficar **na tela de login**, como um **modal
   de configuração de conexão** (não apenas no dashboard).

---

## Fase 1 — Arquitetura alvo

```
[ UDP broadcast ]  backend escuta UDP 41234 com dgram (porta efetiva)
        ▲                      │
  "GRAFICAOS_DISCOVER"   responde {name, ip, port}
        │                      ▼
[ electron client ]  descobre servidor (espera 2-3s)
        │  if não achar -> fallback manual (digitar IP)
        ▼
  window.grafica.discover() -> { name, address, port }
        ▼
  UI (tela de login -> modal de conexão) seta backendUrl()
        ▼
  lib/api.ts backendUrl() (fonte da verdade única)
        ├── API: fetch(`${backendUrl()}${path}`)  (JWT)
        └── Socket.IO: io(backendUrl(), auth token)   <- reconecta se URL mudar
        ▼
  CORS (app.ts): aceita app:// + localhost + RFC1918 + CORS_ORIGINS
        ▼
  Electron servidor: netsh advfirewall add rule (best-effort) na 1ª execução
        ▼
  tela de login: modal de conexão com status Conectado/Reconectando/Offline
```

**Novos módulos / mudanças:**
- `grafica-app/backend/src/discovery.ts` (novo) — socket UDP `dgram` na porta 41234 que
  responde ao `GRAFICAOS_DISCOVER` com `{name, ip, port}` quando o servidor sobe.
- `electron/discovery.js` (novo) — envia broadcast UDP, aguarda resposta 2-3s, expõe via IPC.
- `electron/main.js` — `ipcMain.handle('grafica:discover')`, + firewall netsh no modo server.
- `grafica-app/backend/src/app.ts:25-35` — função de validação CORS RFC1918.
- `grafica-app/src/lib/api.ts` — `setBackendUrl` já dispara `grafica:backend-url` event
  (reutilizar para reconexão de socket).
- `grafica-app/src/app/auth/page.tsx` — **modal de configuração/conexão** + indicador de
  status na tela de login (D3).
- Novo hook `grafica-app/src/hooks/use-connection-status.ts` (health + backoff).
- `notifications-provider.tsx` / `chat/page.tsx` — escutar `grafica:backend-url` para
  reconectar socket com `manager.reconnect` / novo `io()`.

---

## Fase 2 — Task breakdown (atribuição)

### T1 — Descoberta via UDP broadcast — `backend-specialist` + `devops-engineer`
- [ ] `backend/src/discovery.ts`: socket UDP `dgram` escutando **41234** (bind `0.0.0.0`),
      pronto quando o servidor sobe; ao receber a string `"GRAFICAOS_DISCOVER"`, responde
      `{name, ip, port}` (porta efetiva: `PORT` ou 3001); fecha no shutdown.
- [ ] `electron/discovery.js`: cria socket UDP, envia broadcast
      `"GRAFICAOS_DISCOVER"` para `255.255.255.255:41234`, aguarda resposta por **2-3s**,
      usa o primeiro IP que responder; sem resposta → `null`.
- [ ] `ipcMain.handle('grafica:discover')` + bridge `window.grafica.discover()` + tipos em
      `types/grafica.d.ts`.
- [ ] **UI (tela de login / modal de conexão):** chamar discover() ao montar; se achar,
      salvar `backendUrl()` e mostrar "Servidor encontrado: <name> (<ip>)"; se não achar em
      3s, mostrar **"Não encontrou automaticamente? Digite o IP"** (fallback manual).
- **VERIFY:** 2 processos Electron (server+client, portas distintas) na mesma máquina;
      bloqueando a descoberta (sem servidor) → campo manual é ofertado.

### T2 — CORS por faixa privada — `backend-specialist`
- [ ] Em `app.ts:25-35`, criar `isAllowedOrigin(origin, corsOrigins)` que:
      aceita `app://`, `localhost`/`127.0.0.1` (qualquer porta), subnets
      RFC1918 (`192.168/16`, `10/8`, `172.16/12`) na porta do backend, e `CORS_ORIGINS`.
- [ ] Teste unitário (ou manual via `/documentation` + `curl -H Origin:`) confirmando
      `http://192.168.1.50:3001` aceita e origem pública rejeitada.
- **VERIFY:** `npm run build:backend` + teste de origem.

### T3 — Unificar URL API/Socket + reconexão — `frontend-specialist` + `backend-specialist`
- [ ] Auditar e confirmar que `backendUrl()` é única fonte (já é); remover qualquer
      constante independente se houver.
- [ ] `notifications-provider.tsx` e `chat/page.tsx`: escutar `grafica:backend-url` e
      reconectar socket com a nova URL (disconnect + novo `io(backendUrl())`).
- **VERIFY:** mudar URL no Config→Recarregar; chat/notificação continuam funcionando.

### T4 — Firewall automático (Windows) — `devops-engineer`
- [ ] No modo server, 1ª execução: `netsh advfirewall firewall add rule name="GraficaOS
      <porta>" dir=in action=allow protocol=TCP localport=<porta>`; falha silenciosa (log).
- [ ] Evitar duplicar regra (checar existência ou usar nome fixo).
- **VERIFY:** sem permissão → apenas log; com permissão → regra criada.

### T5 — Health check + retry + status na tela de login (modal) — `frontend-specialist`
- [ ] Hook `use-connection-status.ts`: poll `/health` com backoff exponencial
      (ex.: 1s,2s,4s... até 30s) e estado `'online'|'reconnecting'|'offline'`; integrar com
      o estado do socket (conectado/desconectado).
- [ ] `auth/page.tsx`: **modal de configuração de conexão** na tela de login com:
      status (Conectado/Reconectando…/Servidor offline), botão "Testar conexão",
      campo manual de IP (fallback) e resultado da descoberta UDP. O login só prossegue
      quando houver conexão.
- [ ] (Opcional) badge de status no `(dashboard)/layout.tsx` reutilizando o mesmo hook.
- **VERIFY:** matar backend com a tela de login aberta → status "Servidor offline" +
      campo/descoberta; subir → "Conectado" sem refresh; login flui após conexão.

---

## Fase 3 — Critérios de aceite (revisão final)

- [ ] Cliente novo encontra servidor **sem digitar IP** (via UDP broadcast `GRAFICAOS_DISCOVER`).
- [ ] Se IP do servidor mudar, cliente reconecta sozinho (novo discover → novo backendUrl →
      reconexão do socket).
- [ ] Login + API funcionam via IP dinâmico (CORS não bloqueia).
- [ ] Chat/notificações usam o mesmo host da API (sem socket em `localhost`).
- [ ] **Indicador/status + modal de configuração presentes na tela de login.**
- [ ] Fallback manual de IP continua funcionando (aparece se a descoberta não achar em 3s).

**Gates de conclusão:** `npm run build:export` ✓ · `npm run build:backend` ✓ ·
`npm run lint --prefix grafica-app` ✓ · teste 2x Electron (server+client) ✓.

---

## Próximos passos
- Revisar o plano (decisões D1=UDP broadcast, D2=3001+PORT, D3=modal na tela de login
  já incorporadas).
- Rodar `/create` para iniciar a implementação.
