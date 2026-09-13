# Glossário de Domínio — GraficaOS

> **Versão:** 1.0.0 · **Última atualização:** 2026-09-12 · **Owner:** Felipe
> Termos usados em `BUSINESS_RULES.md`, ADRs e integrações. Os termos marcados com ★ são conceitos de produto-alvo (BR-002, ainda não no código).

## Insumos e estoque

| Termo | Definição |
|-------|-----------|
| **SKU** | Nome canônico de um item em `stock_items.name`. Convemções atuais: `hp_tinta-cyan`, `konica_toner-black`, nome da mídia. |
| **Item / Insumo** | Registro em `stock_items` com categoria, unidade, quantidade e mínimo. É a unidade de controle de hoje. |
| **Bobina** ★ | Rolo físico de material (vinil, papel, substrato). **No modelo-alvo é um ativo individual rastreável** (BR-002). Hoje é uma linha de item com `unit='m'` e `label` (ex.: "Rolo B"). |
| **Cut-sheet / Folha** | Papel em folhas soltas (unidade `fls`). |
| **Cartucho** | Tinta em recipiente (HP/konica) — `sub_type` livre. |
| **Rolo** | Sinônimo de bobina na UI. Ação `add-roll` (`stock.ts:289`) duplica o item com saldo igual e status `AVAILABLE`. |
| **Categoria** | `PAPER_MEDIA \| INK_SUPPLY \| OTHER` (BR-003). |
| **Unidade** | `m \| fls \| ml \| L` na API; dedutor Konica também entende `rms \| pk \| bl`. |
| **Metragem linear** | Consumo em metros (m) — como bobina/mídia são debitadas. |
| **Área (m²)** | O que o HP Latex reporta; convertida em metros por `m² ÷ largura`. |

## Movimentações e débito

| Termo | Definição |
|-------|-----------|
| **Transação** | Linha em `stock_transactions`, `type IN \| OUT \| ADJUSTMENT`, quantidade positiva. |
| **IN** | Entrada de estoque (reposição, abertura). |
| **OUT** | Saída/consumo (job, baixa manual). |
| **ADJUSTMENT** | Correção para valor absoluto (só ADMIN/DEV_MASTER — BR-018). |
| **Débito automático** | OUT originado por agente (HP/Konica/Mimaki) a partir de job real. |
| **Baixa manual** | OUT registrado pelo operador. |
| **Matcher** | Heurística que associa um job a um item por nome (normalização, largura, gramatura). Fallback do vínculo explícito (BR-010). |
| **Vínculo (binding)** | Ligação explícita máquina↔item: tabela `machine_items` (N:N) ou `mimaki_jobs.stock_item_id`. |
| **source / source_ref** ★ | Ator origem (`HP_AGENT`, `KONICA_AGENT`, `MIMAKI_AGENT`, `MANUAL`, `SYSTEM`) + causa estruturada (ex.: `job_id`). Alvo da idempotência (BR-008). |
| **Clamp** | Cortar saldo em zero: `Math.max(0, current − qty)` (BR-007, hoje em todos os débitos). |
| **Débito fantasma** | OUT registrado sem saldo de verdade — quebra a reconciliação (efetiva política clamp hoje). |
| **Reconciliação** ★ | Checagem `saldo = Σ IN − Σ OUT` (invariante-alvo, BR-006). |

## Produção e máquinas

| Termo | Definição |
|-------|-----------|
| **Máquina** | Registro em `machines` (hp, konica, mimaki...) com `technology`, `ip`, `status ACTIVE \| MAINTENANCE \| INACTIVE`. |
| **Job / OS** | Ordem de serviço de impressão. No backend: `print_jobs` (HP/Konica, `job_id` único) e `mimaki_jobs` (Mimaki, `folder_timestamp` único). |
| **Estado do material (Mimaki)** | `BOUND` = material vinculado → débito automático; `PENDING_BIND` = sem item correspondente → vincular manual. |
| **stock_deducted** | Flag por job indicando débito já aplicado (barreira de idempotência dupla com `reason`/`source_ref`). |
| **Telemetria** | Dados de nível de tinta/toner, temperatura, bandejas — coletados por poll, não geram débito de tinta (exceto HP tinta por SKU). |

## Alertas e canais

| Termo | Definição |
|-------|-----------|
| **Estado de estoque** | `AVAILABLE \| LOW_STOCK \| OUT_OF_STOCK` (derivado, BR-009). |
| **Alerta de transição** | Notificação+WhatsApp só quando o estado muda para LOW/OUT (BR-015). |
| **Recipiente WhatsApp** | `whatsapp_recipients` (prioridade principal/backup) — substituto do `whatsapp.phone` simples. |
| **Humanização** | Delay de digitação e intervalos naturais para não ser flagrado como bot elo Meta (BR-016). |

## Empresa e produto

| Termo | Definição |
|-------|-----------|
| **Single deploy por empresa** ★ | Modelo de produto: uma base de código productizada, instalada e configurada por cliente (BR-021, ADR-009). Não é multi-tenant. |
| **Settings** | Tabela KV `settings(key, value)` — hoje stringly-typed; destino tipado em `architecture/SETTINGS_CATALOG.md`. |
| **System bot** | Usuários de sistema (`system`, `hp-agent-system`, `konica-agent-system`) que atuam movimentações e mensagens. |