# 16 — WhatsApp / Alertas — Arquitetura e Lacunas

> Documento de apoio para análise no Claude. Foco: **como funciona hoje** o envio de
> avisos via WhatsApp e **o que falta** para o cenário real da gráfica.
>
> **Perguntas respondidas direto:**
> - Todos terão números cadastrados para receber os avisos? → **Não hoje.** Existe **um único**
>   número de destino** (campo `whatsapp.phone`), o mesmo para todos os avisos.
> - Dá para criar um grupo? → **Não hoje.** O código envia mensagem para **um contato**
>   (`<numero>@s.whatsapp.net`), não para um grupo (`Baileys` só envia texto individual).
> - Alerta de mensagem interna? → Existe **notificação interna em tempo real** (Socket.IO +
>   toast) e **chat interno**, mas **não** há "alerta de mensagem interna via WhatsApp".

---

## 1. Fluxo atual do WhatsApp

```
[Baixa de estoque OUT, backend]
        │
        │ stock.ts:327  status tornou-se LOW_STOCK ou OUT_OF_STOCK
        ▼
[1] Cria notificação no banco (tabela `notifications`, userId = quem baixou)
[2] Emite Socket.IO `notification:new` -> sala 'estoque'  (aviso INTERNO em tempo real)
        │
        │ stock.ts:338  waEnabled = settings['whatsapp.enabled'] === 'true'
        │              waPhone   = settings['whatsapp.phone']  (getDestinationPhone)
        ▼
[3] Se enabled E phone existe -> sendWhatsApp(waPhone, texto)   <- UM DESTINATÁRIO
        │
        ▼
[4] lib/whatsapp.ts:82  Envia para `${digits}@s.whatsapp.net` (Baileys)
        │  se offline -> enfileira (QUEUE) e envia quando reconectar (flushQueue)
```

### Componentes envolvidos
| Peça | Arquivo | Papel |
|------|---------|-------|
| Sessão WhatsApp | `backend/src/lib/whatsapp.ts` | Cliente Baileys, QR, reconexão, fila |
| Config/status/test/logout | `backend/src/routes/whatsapp.ts` | API do painel (ADMIN/DEV_MASTER) |
| Disparo de alerta | `backend/src/routes/stock.ts:327-347` | Aciona notificação + WhatsApp |
| Destino/liga/desliga | chave-valor `settings` (lib/settings.ts) | `whatsapp.phone`, `whatsapp.enabled` |
| Painel de configuração | `grafica-app/src/components/whatsapp-panel.tsx` | UI: QR, número, ativar, teste, logout |
| Aviso interno | `notifications-provider.tsx` (Socket.IO) | Toast `notification:new` |

### Configuração única (armazenada no banco `settings`)
- `whatsapp.phone` → **um** número, ex. `5511987654321` (normalizado p/ `55` + DDD no
  `normalizedPhone`, whatssap.ts:30).
- `whatsapp.enabled` → `'true'`/`'false'` (liga/desliga o envio).
- **Aparece em apenas um lugar na UI** (`Configurações → Alertas no WhatsApp`), restrito a
  ADMIN/DEV_MASTER.

---

## 2. O que o sistema FAZ hoje (WhatsApp)

- [x] Parear via QR Code (Baileys `useMultiFileAuthState`, sessão persistida em `wa_auth/`).
- [x] Enviar alerta de estoque baixo/zerado para **UM número** (texto simples).
- [x] Reconexão automática em caso de queda (`setTimeout => createSocket`).
- [x] Fila de mensagens quando desconectado (envia ao reconectar).
- [x] Encerrar sessão / logar de novo pelo painel.
- [x] Enviar mensagem de teste ("✅ Teste GraficaOS...").
- [x] Aviso interno em tempo real (Socket.IO `notification:new` + toast).

---

## 3. O que o sistema NÃO faz (lacunas) — as suas 3 perguntas

### 3.1 "Todos vão ter números cadastrados para receber os avisos?"
**Não.** Hoje há **um único destinatário** (`whatsapp.phone`). O mesmo alerta vai sempre
para o mesmo número. **Para atender todo mundo seria preciso:**
- Modelar **múltiplos destinatários** (ex.: nova tabela `whatsapp_recipients` ligada a
  `users`, ou lista de números no `settings`), e
- um envio em **loop/lote** para cada número, não só `waPhone`.

### 3.2 "Dá para criar um grupo?"
**Não.** O `sendWhatsApp` envia para `<numero>@s.whatsapp.net` (contato individual).
**Para usar grupo no WhatsApp, seria preciso:**
- Enviar para o JID de grupo `<id>@g.us` (Baileys suporta, mas exige resolução do grupo),
- e/ou usar **Broadcast List** (`<id>@broadcast`, visível só para o dono) — menos prático;
- ou **criar/gerenciar o grupo via API Baileys** (features adicionais: criar grupo, adicionar
  membros). Não está implementado.

### 3.3 "Alerta de mensagem interna?"
- **Hoje:** alerta interno = notificação in-app (Socket.IO) + toast, e há um chat interno
  (`/chat`, salas `geral/estoque/producao`) em tempo real.
- **Falta:** "alerta de mensagem interna **também pelo WhatsApp**" (ex.: notificar por
  WhatsApp quando alguém manda mensagem importante no chat interno) **não existe**.

---

## 4. Decisões a tomar no Claude (propostas para avaliar)

| # | Decisão | Opções |
|---|---------|--------|
| D1 | Modelo de destinatários | A) manter 1 número; B) N números por usuário; C) N números fixos |
| D2 | Envio em lote | A) loop sequencial; B) fila + `Promise.all` com retry; C) Broadcast List |
| D3 | Grupo | A) não usar; B) enviar p/ `@g.us` fixo; C) criar/admin grupo via Baileys |
| D4 | Alerta de mensagem interna | A) só in-app (atual); B) espelhar p/ WhatsApp; C) regras por sala/urgência |
| D5 | Agendamento (07:35 / 17:30) | Cron/scheduler **não implementado** — decidir se entra no escopo |

**Impacto técnico resumido:** o núcleo é que tudo hoje depende de **uma** chave
`whatsapp.phone` e de **um** `sendWhatsApp`. Multiplicar destinatários exige uma
**lista/entidade de destinatários** no banco + iteração no disparo, sem reescrever o
cliente Baileys (a camada de envio já está isolada em `lib/whatsapp.ts`).

---

## 5. Arquivos-chave para colar no Claude

- `grafica-app/backend/src/lib/whatsapp.ts` (cliente, envio, fila)
- `grafica-app/backend/src/routes/whatsapp.ts` (API config/status/test/logout)
- `grafica-app/backend/src/routes/stock.ts` linhas 327-347 (disparo do alerta)
- `grafica-app/backend/src/lib/settings.ts` (chave-valor `whatsapp.phone`/`whatsapp.enabled`)
- `grafica-app/src/components/whatsapp-panel.tsx` (painel de configuração)
- `grafica-app/backend/src/db/schema.ts` (tabela `settings`, `users`, `notifications`)
- `grafica-app/src/lib/api.ts` (chamadas `api()`)
