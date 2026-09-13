> **Versão:** 1.0.0 \
> **Status:** ATIVO \
> **Owner:** Felipe \
> **Última atualização:** 2026-09-12 \
> **Origem:** migrado de `docs/15_RELEASE_NOTES.md` (MIGRAÇÃO F5 — ver docs/00_DOCS_INDEX.md).\

# 15 — Release Notes — v1.0

Notas de lançamento da versão 1.0 do GraficaOS.

---

## v1.0.0 (2026-09-10)

### Novidades

#### Integração Mimaki (M2M)
- **Novo endpoint M2M:** `POST /api/integrations/mimaki/jobs` para recepção de jobs de impressão Mimaki.
- **Autenticação M2M:** Suporte a `X-API-Secret` (header) ou `Bearer` token para autenticação máquina-máquina.
- **Dedução automática de mídia:** Cálculo automático de metros lineares consumidos (`height_mm × pages × quantity_units / 1000`) e baixa no estoque quando material é identificado.
- **Vinculação manual:** Endpoint `POST /api/integrations/mimaki/jobs/:id/bind-material` para vincular material a jobs não identificados automaticamente.
- **Listagem de jobs:** Endpoint `GET /api/integrations/mimaki/jobs` com filtros por status e máquina.
- **Evento Socket.IO:** `mimaki:unmatched_material` emitido para sala `estoque` quando material não é identificado.
- **Tabela `mimaki_jobs`:** Nova tabela para persistência de jobs Mimaki com status de material.

#### Privacidade do Chat Bot
- **Respostas em DM:** Comandos do bot (`/help`, `/status`, `/estoque`, `/jobs`, `/alertas`) agora retornam respostas como mensagem privada (DM) para o remetente, não broadcast na sala.
- **Sala `dm:system:<userId>`:** Mensagens do bot são armazenadas em sala privada.
- **Evento `user:<userId>`:** Emissão via Socket.IO apenas para o remetente.

#### Notificações Dinâmicas
- **Badge dinâmico:** Badge no sidebar de Estoque agora exibe contagem real de notificações não lidas (não valor fixo).
- **Atualização em tempo real:** Badge atualiza instantaneamente via Socket.IO (`notification:new`).

#### Página Mimaki
- **Painel informativo:** Máquinas Mimaki exibem painel com informações estáticas (modelo, IP, status) sem telemetria de rede.

### Melhorias

- **RBAC estendido:** Novas permissões para operações Mimaki (receber jobs M2M, vincular material, listar jobs).
- **Schema atualizado:** Adição de campos `avatar` na tabela `users` e tabela `whatsapp_recipients`.
- **Documentação:** Novos documentos de integração Mimaki (14_MIMAKI_INTEGRATION.md) e release notes (15_RELEASE_NOTES.md).

### Correções

- **Chat bot:** Respostas não eram enviadas como DM (broadcast na sala).
- **Notificações:** Badge mostrava valor fixo "3" em vez de contagem real.

### Stack Atualizada

| Camada | Tecnologia | Versão |
|--------|------------|--------|
| Frontend | Next.js | 16 (App Router) |
| Frontend | React | 19 |
| Frontend | Tailwind CSS | v4 |
| Frontend | shadcn/ui | base-maia |
| Backend | Fastify | 5 |
| Backend | Drizzle ORM | latest |
| Backend | Turso LibSQL | Embedded Replicas |
| Backend | Socket.IO | latest |
| Autenticação | JWT | @fastify/jwt |
| Autenticação M2M | X-API-Secret | Custom middleware |

### Breaking Changes

- Nenhuma breaking change nesta versão.

### Migração

- Execute `npm run db:push` para aplicar a nova tabela `mimaki_jobs`.
- Configure `MIMAKI_INTEGRATION_SECRET` no `.env` ou na tabela `settings`.

### Links Úteis

- [Documentação da Integração Mimaki](14_MIMAKI_INTEGRATION.md)
- [Guia de Uso](12_GUIA_DE_USO.md)
- [Especificações RBAC](10_RBAC_SPECIFICATION.md)
- [Decisões Técnicas (ADR)](07_TECHNICAL_DECISIONS_ADR_RFC.md)

