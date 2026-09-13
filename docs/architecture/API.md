# API Pública — GraficaOS

> **Versão:** 1.0.0 · **Status:** ATIVO · **Owner:** Felipe · **Última atualização:** 2026-09-12
> **Fonte de verdade para schemas:** Swagger do backend (`@fastify/swagger` + `swagger-ui`),
> acessível em **`GET /documentation`** no ambiente de dev (`PORT` default `3001`).

---

## 1. Contrato — procedimento do snapshot versionado (PNDG)

O repositório **deve** carregar um **snapshot OpenAPI congelado** para review offline/CI:

```text
grafica-app/backend/openapi/openapi.yaml   # snapshot versionado (contrato público)
```

**Procedimento oficial (pendente — não rodado neste ciclo):**

1. Em dev, suba o backend: `cd grafica-app/backend && npm run dev`.
2. Colete o webhook: `curl -s http://localhost:3001/documentation/json -o openapi/openapi.yaml`.
3. É **reflexo do código** (totalmente gerado) — não editar à mão.
4. `docs:check` (1.4) garante que IDs `BR-/ADR-/INT-` citados em `description` do swagger ainda
   existem — integrado quando o script nascer.

> **Regra:** diff no snapshot = mudança de contrato = **PR próprio** com julgamento de
> breaking/major (nunca embutida em PR de feature). Snapshot atrasado está **ciente** (não é
> usado por CI ainda — sem gate).

## 2. Inventário de grupos (como hoje no `app.ts:142-152`)

| Grupo | Router | Auth | Notas |
|-------|--------|------|-------|
| Auth | `routes/auth.ts` | público | `register` (cria OPERATOR), `login` (JWT 12h) |
| Stock | `routes/stock.ts` | JWT+RBAC | itens, transações, ajustes, status |
| Machines | `routes/machines.ts` | JWT | cadastro de máquinas (Mimaki/HP/Konica) |
| Suppliers | `routes/suppliers.ts` | JWT | fornecedores |
| Users | `routes/users.ts` | JWT | dev/ADMIN; promoção/exclusão DEV_MASTER |
| Chat | `routes/chat.ts` | JWT+socket | salas `geral/estoque/producao`, `dm:`; comandos `/` (ADR-004) |
| Notifications | `routes/notifications.ts` | JWT | ack/limpar/`GET` (BR-015) |
| WhatsApp | `routes/whatsapp.ts` | JWT (DEV_MASTER/ADMIN) | envia, recebe, status, troca de QR, carrega grupo |
| Reports | `routes/reports.ts` | JWT | relatórios de estoque |
| Jobs | `routes/jobs.ts` | JWT | jobs de impressão (HP/Konica), `sync-stock` |
| Integrations/Mimaki | `routes/mimaki.ts` | M2M JWT | `jobs`, `bind-material`, `sync-stock` (ADR-003) |

## 3. Convenções

- Prefixo **`/api/...`** em todos os grupos.
- **Listas paginadas** → usar `limit`/`offset` dos recursos que já paginam (ver Swagger do recurso).
- Erros: padrão `{ error: string }` (e `details` em validação Zod com 400).
- Socket.IO public events: `notification:new`, `mimaki:unmatched_material`, `stock:deducted`, `chat:message` (obs.: socket é espelho interno, não faz parte do contrato REST/OpenAPI).

## 4. Evolução

- Nova rota/rota que muda contrato → atualizar procedimento da seção 1 (snapshot) **no mesmo
  PR**; alterar grupos aqui e `docs/architecture/LLD.md`.