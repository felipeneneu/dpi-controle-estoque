# Modelo de Domínio — GraficaOS (as-is vs target)

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12 · **Owner:** Felipe
> **Status:** o ERD *as-is* espelha `D:\www\2026\felipe-neneu-portfolio\dpi-controle-estoque\grafica-app\backend\src\db\schema.ts`. O ERD *target* descreve o destino de produto (BR-002, ADR-009) — **não implementado**.

---

## 1. As-is — modelo atual (quantidade agregada por SKU)

### Entidades

```
users ──< stock_transactions >── stock_items <── machine_items ──> machines
suppliers                                   │
whatsapp_recipients                         │
notifications (userId, itemId)              │
settings (KV)
stock_transactions: type IN|OUT|ADJUSTMENT, quantity (sempre +), reason (livre), user_id/user_name
print_jobs (HP/Konica): job_id UNIQUE, stock_deducted, rollWidthUsed, linearMetersDebited
mimaki_jobs: folder_timestamp UNIQUE, materialStatus BOUND|PENDING_BIND, stock_item_id?, length_meters, ink_*_cc
machine_telemetry: ink ml / toner % / trays / temperatura / online (denormalizado por máquina)
```

### Pontos que caracterizam o as-is

- **`stock_items.current_quantity`** é um agregado por SKU: duas bobinas de 50 m viram "100 m" numa linha. Perde-se identidade física, metragem por rolo e localização.
- **Trilha de auditoria parcial:** transações existem, mas sem `balance_before/after` nem `source_ref`; criação/`add-roll`/PUT direto não geram transação.
- **Débito não atômico:** `read-modify-write` sem transação SQL; clamp silencioso em todos os fluxos.
- **Idempotência frágil:** `reason LIKE '%jobName%'`; ausente nas tintas Mimaki.
- **`settings` stringly-typed;** múltiplos fatores de conversão e matchers espalhados.

## 2. Target — modelo de destino (bobina como ativo)

> Regido por **BR-002 / BR-018 / BR-021 / ADR-009**. Abaixo a proposta conceitual de entidades para orientar ADRs e refactor futuro — **não é schema aprovado** (cada detalhe precisará de RFC).

### Entidades propostas

```
StockItem (catálogo / SKU)                 ← continua sendo a "família" de material
  |- 1:N Bobina (ativo físico)              ← NOVA entidade central
       id (uuid ou serial/barcode)
       sku/stock_item_id  FK
       serial / codigo_barras
       width_mm / meters_initial / meters_remaining
       state: NEW | IN_USE | USED | BLOCKED | SCRAPPED
       location: deposito | machine:<id> | cliente | sucata
       bobina_opened_at / finished_at
       consumptions 1:N  → substitui/augmenta stock_transactions por bobina
  |- StockLedger (stock_transactions + balance_before/after + source_ref)  ← reforço da auditoria
  |- Machine (status) ── machine_items ── StockItem (vínculo explícito)
  |- PrintJob / MimakiJob ──> deduction (referencia bobina consumida: bobina_id)
```

### Como as somas viram derivadas

- `StockItem.currentQuantity` (exposição por família) = Σ `meters_remaining` das bobinas ativas (NEW+IN_USE) — **derivado, não coluna gravada**.
- Dedução de um job escolhe **qual bobina** consumir (política FIFO por localização ou por máquina vinculada), decrementa `meters_remaining` daquela bobina e registra o consumo.
- Estados da bobina respondem às perguntas que hoje não têm resposta:
  - "bobina A tem 8 m e está na máquina 2" → `state=IN_USE`, `location=machine:2`, `meters_remaining=8`.
  - "bobina B tem 50 m intactos no estoque" → `state=NEW`, `location=deposito`, `meters_remaining=50`.

### Delta migração (esforço futuro — **não** parte deste plano)

| Fase futura | Mudança |
|---|---|
| M1 | Criar entidade `bobinas` + `qrcode/serial` + localização/estado; tela "rolos/bobinas" no estoque |
| M2 | Migrar linha atual por SKU → bobinas físicas (backfill), transações IN de abertura |
| M3 | Dedução por bobina (FIFO), estados automáticos (`USED` ao zerar, `SCRAPPED` por descarte) |
| M4 | Reconciliação `Σ bobinas = Σ ledger`; relatórios por rolo e por máquina |
| M5 | RFID/barcode físico (INT-008 no catálogo) |

> Cada fase M1..M5 precisa de RFC/ADR própria. Este documento apenas fixa o modelo-linha-mestra.

## 3. Comparativo sumário

| Aspecto | As-is | Target |
|---------|-------|--------|
| Unidade de controle | SKU (`current_quantity`) | Bobina (`meters_remaining`) |
| Identidade física | `label` livre (ex.: "Rolo B") | id por rolo + serial/barcode |
| Metragem por rolo | não existe | `meters_remaining` por bobina |
| Estado | derivado do agregado (`AVAILABLE/LOW_STOCK/OUT_OF_STOCK`) | por bobina (`NEW/IN_USE/USED/BLOCKED/SCRAPPED`) |
| Localização | não existe | `location` (depósito, máquina, cliente…) |
| Dedução | saldo do item | consumes da bobina específica |
| Auditoria | parcial (sem saldo antes/depois, sem source_ref) | ledger completo (BR-005..008) |
| Personalização por empresa | código | config (BR-021) |

> ERDs renderizáveis (Mermaid) podem ser adicionados aqui quando o as-is for validado com o schema real da branch base.