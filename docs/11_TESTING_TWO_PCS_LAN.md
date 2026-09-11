# 11 — Guia de Teste: App em 2 PCs na LAN (teste de conexão)

> Objetivo: validar o GraficaOS rodando como **app desktop (Electron)** em **2 computadores na mesma rede doméstica**, confirmando conexão, sincronização de estoque, chat em tempo real e notificações.

---

## 1. Arquitetura do teste

```
PC1 (servidor da LAN)  ──────────►  http://<IP-PC1>:3001  ◄──────────  PC2 (cliente)
├── App GraficaOS (.exe)                                    ├── App GraficaOS (.exe)
└── Backend Fastify + Socket.io (:3001)                     └── URL do backend = http://<IP-PC1>:3001
```

- **PC1** roda o **backend** (embutido no app ou manual via `npm run dev:backend`).
- **PC2** roda **apenas a UI**, conectando na API do PC1 pela LAN.

## 2. Pré-requisitos

| Requisito | Detalhe |
|-----------|---------|
| Node.js **20.6+** | Somente necessário no PC1 (se não usar o .exe) e para gerar o build |
| Mesma rede | Os 2 PCs na mesma Wi-Fi/roteador (sem telefone como ponto de acesso isolado) |
| Firewall | Porta `3001` liberada no PC1 (ver §3.2) |
| Build | `grafica-app/out/` (UI estática) e `backend/dist/` gerados |

## 3. Preparo no PC1

### 3.1 Descobrir o IP do PC1
```powershell
ipconfig
```
Anote o **IPv4** da sua conexão ativa (ex.: `192.168.0.10`). É esse endereço que o PC2 vai usar.

### 3.2 Liberar a porta 3001 no Firewall do Windows
```powershell
# PowerShell como Administrador
netsh advfirewall firewall add rule name="GraficaOS 3001" dir=in action=allow protocol=TCP localport=3001
```
Para remover depois: `netsh advfirewall firewall delete rule name="GraficaOS 3001"`.

### 3.1.1 IP na prática (sem decorar nada)
- No **app Server**, o card "Conexão com o Backend" mostra uma **faixa verde** com as URLs prontas:
  `http://<IP-y>:3001` e `http://<NOME-DO-PC>:3001` — botão **Copiar** em cada uma.
- O **nome do PC** (ex.: `http://DESKTOP-ECOHR0E:3001`) funciona na LAN mesmo se o IP mudar (resolução de hostname do Windows) — é o mais prático para a empresa.
- No **app Client**, o mesmo card mostra "Peça ao administrador a URL do servidor" → cole.
- Dica para estabilidade: fixar o IP do PC1 no roteador (reserva DHCP), assim a URL nunca muda.

### 3.3 Gerar os builds
```bash
npm run build:export      # UI estática -> grafica-app/out/
npm run db:push           # banco (aplica schema)
npm run db:seed           # dados de exemplo
```

## 4. Opção A — Teste em dev com o Electron (ver o app rodando)

```bash
npm run dev:electron
```
Sobe **tudo em dev**: builda UI (`out/`) + backend (`dist/`), abre a janela do Electron em modo servidor.
- Se o backend já estiver na `:3001` (o seu `dev:backend`), ele **não duplica** — só ignora o spawn.
- Se não estiver, o app **spawna** o backend (`node dist/server.js`) sozinho e já abre a UI conectada.
- Para ver o comportamento de **cliente** em vez do servidor: `npm --prefix electron run start`.

## 5. Teste rápido em navegador (sem Electron)

1. **PC1**:
   ```bash
   npm run dev:backend     # API em http://0.0.0.0:3001 (escuta na LAN)
   npx serve -l 3000 out   # serve a UI estática (ou npm run dev:ui)
   ```
2. **PC2**: abra `http://<IP-PC1>:3000` no navegador.
3. **PC2**: defina a URL do backend para `http://<IP-PC1>:3001`
   (campo em Configurações → "URL do backend", salvo em `localStorage`). No PC1 deixe `http://localhost:3001`.
4. Teste login: `felipe@grafica.local` / `admin123` (seed).

## 6. Opção B — Instaladores (roteiro oficial, 2 pacotes)

São **2 instaladores** (`npm run package:electron`):

| Instalador | Onde instalar | O que faz |
|------------|---------------|-----------|
| `dist\server\GraficaOS Server Setup 0.1.0.exe` | Somente o **PC1 (servidor)** | UI + backend embutido; ao abrir o app, sobe a API em `:3001` sozinho |
| `dist\client\GraficaOS Setup 0.1.0.exe` | Os **demais PCs** | Apenas UI; conecta no backend do PC1 |

Roteiro:

1. **PC1**: instalar e abrir o **Server** → o backend sobe sozinho (`:3001`). Verifique no log.
2. **PC1** (Configurações): URL do backend = `http://localhost:3001`.
3. **Outros PCs**: instalar o **Client** e abrir.
4. **Cada cliente** (Configurações): URL do backend = `http://<IP-PC1>:3001` → **"Testar conexão"** (deve responder `ok`).
5. Faça login em todos (`felipe@grafica.local` / `admin123`).

> **Para o server subir a API é obrigatório que o PC1 tenha Node.js 20+ instalado** (o spawn usa `node dist/server.js`). Client não precisa de nada.

## 7. Checklist de teste (validação da conexão)

| # | Teste | Como | Esperado |
|---|-------|------|----------|
| 1 | Health check | PC2 → "Testar conexão" | `ok` |
| 2 | Login simultâneo | Logar nos 2 PCs | Ambos autenticam (JWT) |
| 3 | UI da API | PC2 → `http://<IP-PC1>:3001/documentation` | Swagger abre |
| 4 | Criar insumo (PC1) | Estoque → novo item | Item aparece no **PC2** (sem refresh) ou ao recarregar |
| 5 | Baixa estoque (PC2) | Estoque → dar baixa (OUT) | Quantidade cai e transação registrada (visível no PC1) |
| 6 | Estoque baixo → alerta | Baixa até `current ≤ min` | Notificação/`toast` + tentativa de WhatsApp (se configurado) |
| 7 | Chat realtime | PC1 e PC2 no `/chat` | Mensagem de um aparece no outro em tempo real (Socket.io) |
| 8 | Status WhatsApp | PC2 → Configurações → WhatsApp | `connected: true` refletido dos dois lados |
| 9 | Chat bot DM | Enviar `/estoque` no chat | Resposta aparece como DM privada (não na sala) |
| 10 | Notificação dinâmica | Baixa estoque até LOW_STOCK | Badge no sidebar atualiza com contagem real |
| 11 | Mimaki M2M | POST /api/integrations/mimaki/jobs (X-API-Secret) | Job registrado, material deduzido ou PENDING_BIND |
| 12 | Mimaki bind | POST /api/integrations/mimaki/jobs/:id/bind-material | Material vinculado, estoque deduzido |
| 13 | Mimaki unmatched | Job com material não identificado | Evento mimaki:unmatched_material emitido na sala estoque |

## 8. Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|----------------|---------|
| `ERR_CONNECTION_REFUSED` no PC2 | Firewall bloqueando 3001 | §3.2 (rodar netsh no PC1) |
| `ERR_CONNECTION_TIMED_OUT` | IP errado / redes diferentes | Confirmar `ipconfig`; mesmos SSID e roteador |
| UI funciona, chat não emite | Socket.io conectando em `localhost` | Revisar URL do backend no PC2 (T1/T2 do plano Electron) |
| `TURSO_DATABASE_URL` vazio → erro | Sem Turso cloud | Usar `file:./local-replica.db` (default) — réplica local basta |
| CORS bloqueado | Backend com `origin` restrito | Backend já usa `@fastify/cors { origin: true }` — ok |
| Porta 3001 ocupada | Outro processo | `netstat -ano | findstr 3001` e trocar `PORT` |

## 9. Encerramento

- Pare o backend (Ctrl+C) e remova a regra do firewall se desejado.
- Em casa, apenas **PC1** precisa do backend rodando; PCs 2/3 são sempre "clientes".
- Com Turso configurado (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`), o PC1 sincroniza a réplica com a nuvem — os demais PCs continuam lendo via LAN do PC1.