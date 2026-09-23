# PLAN FINAL — Teste de 1 semana do Electron (o que rodar)

> **Escopo:** LAN (1 servidor + N clientes). Features do teste: estoque + usuários + chat,
> telemetria de máquinas, WhatsApp. **Mesa de imposição Konica SAÍDA do app (T1 cancelado)** —
> imposição fica fora dos instaladores desta semana.
> **Banco:** Turso cloud (já configurado). **Status:** PLANO FINAL APROVADO — seguir T2→T12.

---

## 1. Instaladores e o que terão

### `Dpi Controle de Estoque Setup 0.1.0.exe` — CLIENT

| Camada | Conteúdo |
|---|---|
| Shell | Electron 33 + Chromium + Node interno |
| Código | `main.js`, `preload.js`, `discovery.js` (janela frameless, controles, zoom, UDP discover, IPC) |
| UI | Build estático do Next → `resources/graficaos/ui/` |
| Modo | `mode.json` = `{"mode":"client"}` |
| **Sem sidecars** | Genómena. Nesta versão de teste o client **NÃO** embarca ImpositorKonica nem AutoImposerCLI |

**Comportamento:** UI estática local; no login abre "Conexão com o servidor", encontra o
servidor via UDP (fallback: IP manual) e conversa com `http://<ip-servidor>:3001`.

### `Dpi Controle de Estoque Server Setup 0.1.0.exe` — SERVER

| Camada | Conteúdo |
|---|---|
| Shell | Electron 33 (mesmo) |
| UI | Idêntica à do client |
| Backend | `dist/`, `drizzle/` (migrations), `public/` (**avatares/máquinas — ref T4**), `node_modules/`, `.env` → `resources/graficaos/backend/` |
| Modo | `mode.json` = `{"mode":"server"}` |
| Em execução | API + Socket.IO em `0.0.0.0:3001`, responde UDP `41234`, regras de firewall TCP 3001 **+ UDP 41234 (ref T3)**, agentes HP/Konica/Mimaki watcher, brain, schedulers, WhatsApp/Baileys, alertas |

**Pré-requisito da máquina servidora:** Node.js instalado no PATH (backend sobe via `node`).
Dados no Turso cloud (internet obrigatória no servidor).

---

## 2. Dia 0 — Preparação (≈8h)

| # | Tarefa | Tempo | Quem | Detalhe técnico |
|---|---|---|---|---|
| T1 | ~~Corrigir sidecar Konica~~ | — | — | ❌ **CANCELADO** — mesa sai do app; client sem sidecar |
| **T2** | Hook `prepackage:server` + `sync-staging.js` | 1h | dev | `electron/scripts/sync-staging.js`: limpa e copia de `grafica-app/backend` → `electron/staging/backend` os itens `dist/`, `drizzle/`, **`public/`**, `node_modules/`, `package.json`, `package-lock.json`, `.env`. Adicionar em `electron/package.json` o script `"prepackage:server": "node scripts/sync-staging.js"` (npm roda `pre*` antes de `package:server` automaticamente). |
| **T3** | Liberar UDP 41234 no `main.js` | 1h | dev | `electron/main.js` `openFirewallBestEffort()`: além do TCP 3001, adicionar `netsh advfirewall firewall add rule name="GraficaOS Discover (UDP 41234)" ... protocol=UDP localport=41234` (porta vinda de `./discovery.js`); excluir regra antiga antes de criar. |
| **T4** | Endpoint de avatares no backend | 4h | dev | **Bug:** `grafica-app/backend/src/lib/paths.ts:3` aponta `USERS_PUBLIC_DIR` p/ `grafica-app/backend/public/users` que **não existe** (fotos vivem em `grafica-app/public/users`) → `/users/*.jfif` dá 404 no client. Fix: `paths.ts` com fallback dev p/ `grafica-app/public/users`; garantir `public/**` no sync (T2) embute as fotos no server. |
| **T5** | Rotacionar token Turso (escopo restrito) | 30min | PO | Gerar novo `TURSO_AUTH_TOKEN` no painel Turso; atualizar `grafica-app/backend/.env`; o sync-staging (T2) propaga para `electron/staging/backend/.env`. Não commitar. |
| **T6** | Playbook de instalação (print + IP manual) | 1h | ops | Guia impresso: SmartScreen "More info → Executar mesmo assim"; server exige Node; usuário de teste; conexão por IP manual quando descoberta UDP falhar; logs em `%APPDATA%\Dpi Controle de Estoque Server\backend.log`; setup do WhatsApp (settings + QR) e IPs das máquinas de telemetria. |
| **T7** | Empacotar com prepackage:server | 30min | dev | Rodar `npm run package:server` (raiz → build:export + build:backend + hook sync-staging + electron-builder) e conferir o instalador novo; reutilizar `dist/client` atual (sem sidecar, sem mudanças). |

**Total ~8h.**

---

## 3. Dia 1 — Distribuição (≈2h)

| # | Tarefa | Verificação |
|---|---|---|
| T8 | Copiar `dist/server/Dpi Controle de Estoque Server Setup 0.1.0.exe` + `dist/client/Dpi Controle de Estoque Setup 0.1.0.exe` para o share/Rede | Arquivos no share, tamanhos OK |
| T9 | Instalar **Server** em 1 máquina (como admin) | Instalação termina; ícone criado |
| T10 | Abrir Server → conferir `/health` e log `[graficaos] spawnando backend` | `http://localhost:3001/health` responde `{"status":"ok"}`; `%APPDATA%\Dpi Controle de Estoque Server\backend.log` sem crash |
| T11 | Instalar **Client** em 2–3 máquinas | Instalação nas 3 termina |
| T12 | Verificar descoberta UDP + login em cada client | Modal "Conexão com o servidor" encontra o servidor (ou IP manual); login de teste OK |

**Se tudo OK → operação normal começa.** Roteiro da semana: estoque/entradas-saídas, chat
multi-client, telemetria (IPs HP/Konica confirmados), WhatsApp (QR + alerta de estoque).

---

## 4. Checklist de aceite

- [ ] T2: `npm --prefix electron run package:server` executa o hook e gera instalador
- [ ] T3: como admin, `netsh advfirewall firewall show rule name="GraficaOS Discover (UDP 41234)"` existe
- [ ] T4: `curl http://localhost:3001/users/felipeneneu.jfif` → 200; avatares aparecem no chat
- [ ] T5: token Turso novo em `.env` dev e em `staging/backend/.env`; acesso ao banco OK
- [ ] T7: `dist\server\win-unpacked\resources\graficaos\backend\public\users\*.jfif` presentes
- [ ] T10: `/health` OK + log do spawn
- [ ] T12: login em todos os clients (descoberta OU IP manual)
- [ ] 2 clients simultâneos veem os mesmos dados (Turso)

---

## 5. Riscos e notas

- **Banco compartilhado:** teste grava no Turso "de verdade". Se dados sensíveis, hostilizar
  teste → alternativa: `TURSO_DATABASE_URL=file:./local-replica.db` + `SEED=true`.
- **Descoberta UDP** ainda depende do firewall do servidor também em UDP (T3) **e** de estar
  na mesma rede; sempre documentar o fallback de IP manual (T6).
- **Node no servidor** é pré-requisito; se um dia não houver, embarcar `node.exe` em
  `resources/` + `GRAFICA_NODE`.
- **WhatsApp** ficou como setup operacional (Dia 1 em diante), não como build task.
- Instaladores não assinados → SmartScreen (documentado no playbook, T6).