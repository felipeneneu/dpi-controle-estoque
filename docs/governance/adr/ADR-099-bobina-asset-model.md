# ADR-009 — Modelo Bobina-Ativo e Configuração por Empresa (visão de produto)

- **Status:** Proposto (visão travada — **destino de produto**, não implementação deste ciclo)
- **Data:** 2026-09-12
- **Owner:** Felipe
- **Domínio:** inventory / company-config
- **Links:** cita **BR-002**, **BR-018**, **BR-019**, **BR-021**; afeta (futuro): `grafica-app/backend/src/db/schema.ts`, `grafica-app/backend/src/routes/stock.ts`, UI de estoque
- **Base conceitual:** `docs/business/DOMAIN_MODEL.md` (ERD target), `docs/PLAN-enterprise-governance.md`

## Contexto

O GraficaOS hoje trata estoque como quantidade agregada por SKU (`stock_items.current_quantity`): duas bobinas de 50 m colapsam numa linha "100 m disponíveis", e é impossível saber "bobina A tem 8 m e está na máquina 2" versus "bobina B tem 50 m intactos no estoque". Além disso, o produto deve ser **enterprise de deploy por empresa** (não multi-tenant): uma base productizada, customizada por configuração — sem fork por cliente.

## Decisão

**1. Estoque por unidades físicas rastreáveis (bobina-ativo).** Cada bobina vira um registro com identidade própria (serial/barcode), metros restantes, estado (`NEW | IN_USE | USED | BLOCKED | SCRAPPED`) e localização física (depósito, máquina, cliente, sucata). As somas por SKU tornam-se **derivadas** (Σ das bobinas). Movimentação de um job passa a reservar/decrementar **uma bobina específica**. A semente já existe no endpoint `add-roll` (`grafica-app/backend/src/routes/stock.ts:289`).

**2. Configuração por empresa (BR-021).** Os pontos hoje hard-coded (categorias, unidades, fatores de conversão, matchers, cores, políticas de alerta, flags) passam a viver em configuração tipada (ver `architecture/SETTINGS_CATALOG.md` e o ledger em `architecture/LAYERS.md`). Novo deploy de empresa = pacote de config, nunca fork.

**3. Cronograma de produto:** ADR-009 fixa a *visão* (regra TARGET). A implementação é dividida nas fases M1..M5 de `business/DOMAIN_MODEL.md`, cada uma exigindo RFC/ADR própria. Este ciclo de documentação **não implementa** nenhuma dessas fases.

## Consequências

- **Positivas:** rastreabilidade física; resposta às perguntas operacionais hoje impossíveis; base para RFID/barcode (INT-008); personalização por empresa sem código; governança estável do propósito.
- **Negativas:** refactor profundo de schema + débito + UI; migração de dados do modelo agregado → físico (backfill); risco de escopo durante a transição (mitigado por RFCs individuais).
- **Migração:** descrita em `DOMAIN_MODEL.md §3` (M1..M5). Nenhuma delas iniciada neste ciclo.

## Verificação

Este ADR é verificado pela própria documentação: regras BR-002/BR-018/BR-019/BR-021 com status `TARGET` e por `business/DOMAIN_MODEL.md` refletindo o schema as-is. Ao implementar, cada fase M1..M5 atualiza o status das BR-* correspondentes.