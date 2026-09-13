# Catálogo de Settings — GraficaOS

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12
> **Propósito:** inventário de TODAS as chaves de configuração (tabela `settings` + env vars) com tipo proposto, default e uso. Alvo de BR-021: settings tipadas por empresa.
> **Evidência:** `grafica-app/backend/src/lib/settings.ts`, `db/schema.ts:125-129`.

---

## 1. Tabela `settings` (KV — hoje stringly-typed)

| Chave | Tipo proposto | Default | Usado em | Escopo |
|-------|---------------|---------|----------|--------|
| `whatsapp.enabled` | bool (`'true'`/`'false'`) | `'false'` | `lib/whatsapp.ts:114`, `lib/notification-resend.ts:78` | empresa |
| `whatsapp.phone` | string (e164) | — | `lib/whatsapp.ts:97,130` | empresa |
| `whatsapp.groupId` | string | — | `lib/whatsapp.ts:141` | empresa |
| `konica_toner_capacity_pages` | number | `20000` | `agents/konica/telemetry-store.ts:11` | máquina |
| `konica_toner_pages_printed` | number | — | `agents/konica/telemetry-store.ts:12` | máquina |
| `konica_toner_capacity_grams` | number | `300` | `agents/konica/device-info.ts:5` | máquina |

> ⚠️ **Drift conhecido:** toner Konica é interpretado de dois jeitos (páginas vs gramas) com chaves distintas — risco de inconsistência; decisão pendente (documentar em ADR-013 futuro).

### Destino (alvo BR-021)

```ts
// Exemplo de shape desejado (config tipada por empresa) — NÃO implementado.
type CompanyConfig = {
  catalog: { categories: string[]; units: string[]; inkLabels: Record<string,string> };
  agents: { hp: { pollIntervalMs:number; enabled:boolean }; konica: {...}; mimaki: {...} };
  stock: { negativePolicy: 'fails-fast'|'clamp'|'clamp+alert'; defaultMediaWidthM: number };
  alerts: { transitionOnly: boolean; schedule?: { briefing:string[] } };
  messaging: { whatsapp: { enabled:boolean; phone:string; groupId?:string; recipients: {principal:string[];backup:string[]} } };
  machines: { adapterType: 'hp-latex'|'konica'|'mimaki'; inkColorMap: Record<string,string>; uvChannels: Record<string,string> };
  system: { botIds: string[] };
  flags: Record<string, boolean>;
};
```

## 2. Variáveis de ambiente (env)

| Variaável | Default | Usado em | Descrição |
|-----------|---------|----------|-----------|
| `PORT` | `3001` | `server.ts:16` | porta da API |
| `SEED` | — | `server.ts:157` | `'true'` popula o banco |
| `TURSO_DATABASE_URL` | `file:./local-replica.db` | `db/index.ts:5` | banco/URL Turso |
| `TURSO_AUTH_TOKEN` | — | `db/index.ts:6` | token do Turso |
| `JWT_SECRET` | (obrigatório em prod) | `app.ts:56-59` | segredo JWT |
| `CORS_ORIGINS` | — | `app.ts:37` | origens permitidas (vírgula) |
| `RATE_LIMIT_MAX` | `100` | `app.ts:48` | limite rate-limit |
| `MIMAKI_INTEGRATION_SECRET` | — | `middleware/m2m-auth.ts:29`, ADR-003 | secret M2M Mimaki |
| `GRAFICA_DISCOVER_PORT` | `41234` | `discovery.ts:4` | porta de descoberta LAN |
| `GRAFICA_WA_AUTH_DIR` | `wa_auth/` (cwd) | `lib/whatsapp.ts:17` | pasta de sessão do Baileys |
| `HP_LATEX_IP` | `192.168.234.10` | `agents/hp-latex/index.ts:14` | IP da HP |
| `HP_POLL_INTERVAL_MS` | `60000` | `agents/hp-latex/index.ts:15` | polling HP |
| `HP_DOWNLOAD_TIMEOUT_MS` | `10000` | `agents/hp-latex/index.ts:16` | timeout de download |
| `HP_AGENT_ENABLED` | `'true'` | `agents/hp-latex/index.ts:17` | liga/desliga agente |
| `KONICA_IP` | `192.168.234.68` | `agents/konica/index.ts:14` | IP da Konica |
| `KONICA_POLL_INTERVAL_MS` | `30000` | `agents/konica/index.ts:15` | polling Konica |
| `KONICA_AGENT_ENABLED` | `'true'` | `agents/konica/index.ts:16` | liga/desliga agente |
| `KONICA_URL` | `http://192.168.234.68:30083` | `agents/konica/fetcher.ts:3` | base URL PrintManager |
| `KONICA_TIMEOUT_MS` | `10000` | `agents/konica/fetcher.ts:4` | timeout |
| `KONICA_FINISHED_CONTAINER` | `268435444` | `agents/konica/fetcher.ts:5` | container de jobs finalizados |

## 3. Convenção

- Pré-fixes por domínio (ex.: `whatsapp.`, `agents.hp.`, `stock.`, `messages.`).
- Toda chave nova = atualizar este catálogo + `RULE_CHANGELOG`/PR (P9 em `governance/DOC_POLICIES.md`) no mesmo PR.
- Env = infra por deploy; `settings` = negócio por empresa; quando possível, preferir `settings` para regras e env para segredos/endereços.