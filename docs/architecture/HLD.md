> **Versão:** 1.0.0 \
> **Status:** ATIVO \
> **Owner:** Felipe \
> **Última atualização:** 2026-09-12 \
> **Origem:** migrado de `docs/05_SYSTEM_DESIGN_HLD.md + 02_TRD (digest); 13_LAN arquivado` (MIGRAÇÃO F5 — ver docs/00_DOCS_INDEX.md).\

# 🏗️ High-Level System Design (HLD)

---

### Arquitetura Geral do Sistema (Offline-First com Turso)

```text
 💻 Computador 1 (Servidor Local LAN / PC Balcão)
 ├── Electron Client (.exe)
 └── Backend Node.js (Porta 3001)
      ├── API Fastify + Socket.io + Cron
      └── Turso Client (Drizzle ORM)
             │
             ├── Local Embedded Replica Sync ──┐
             ▼                                  ▼
 📂 local-replica.db (SQLite)        ☁️ Turso Cloud Database (LibSQL)
                                                ▲
             ┌──────────────────────────────────┘
             │ (Sincronização Cloud via HTTPS)
             ▼
 💻 Computadores 2 e 3 (Produção / Admin)
 └── Electron Client (.exe) ──► Conecta no Turso / Node Local
```

### Protocolos de Comunicação
- **Interno Electron -> Node.js**: HTTP/REST + WebSockets na porta 3001.
- **Node.js -> Turso Cloud**: LibSQL protocolo sobre HTTPS/WebSockets.
- **Mimaki Tracker -> Node.js**: HTTP/REST (POST /api/integrations/mimaki/jobs) via X-API-Secret.

### Integração Mimaki (M2M)

```text
🖥️ Mimaki Tracker Electron (192.168.234.28)
│
│ POST /api/integrations/mimaki/jobs (X-API-Secret)
▼
💻 Backend Fastify (Porta 3001)
├── Valida schema (Zod)
├── Calcula length_meters = (height_mm × pages × quantity_units) / 1000
├── Busca material por nome (LIKE) na tabela stock_items
├── Se encontrado → deduz estoque (transação OUT) + status BOUND
├── Se não encontrado → status PENDING_BIND + emite Socket.IO mimaki:unmatched_material
└── Retorna 201 { job_id, length_meters, material_status, stock_item_id }
```

### Fluxo do Chat Bot (Privacidade)

```text
👤 Usuário envia "/estoque" na sala "geral"
│
├── Mensagem do usuário → armazenada na sala "geral" + broadcast para sala
│
├── Bot processa comando
├── Resposta → armazenada em dm:system:<userId>
└── Emitida via Socket.IO `user:<userId>` (DM privada)
```

