# ADR-052: Cartucho de Tinta/Toner como Ativo Rastreavel por Canal

> **Status:** Aprovado
> **Data:** 2026-10-02
> **Autor:** Felipe / Engenharia GraficaOS
> **Dominio:** inventory / deduction / alerts
> **Regra de Negocio:** BR-052, BR-054 (reforma BR-011)
> **Substitui / Complementa:** Complementa ADR-009 (Emenda 4), ADR-007, ADR-008, ADR-013

---

## 1. Contexto

HP Latex 330 e Konica AccurioPrint nao debitam tinta por job de forma confiavel:

- **HP Latex 330** debita por job via `INK_COLOR_MAP` em `stock_items.currentQuantity` (BR-011), com debito agregado e sem lastro. O operador nao sabe qual cartucho esta na maquina, nem quanto resta nele. Alem disso o debito por job e derivado de telemetria de contagem, que nao fecha com o volume real consumido quando ha ajuste de cor, calibracao ou desperdicio.
- **Konica AccurioPrint** nao expoe toner por job (BR-013). O nivel vem da telemetria em **porcentagem**, mas hoje isso so alimenta um alerta cru.

Pergunta do operador, nos termos dele: "a maquina tem uma tinta por canal e a tinta troca de tempos em tempos; eu quero saber qual cartucho esta la, quanto sobrou, e que eu comprei o codigo tal".

O modelo de ativo ja existe e funciona: `bobinas` (rolo) e `garrafas` (Mimaki 1000ml) sao ativos fisicos com `state`/`location` e consumo direto no frasco. Tinta HP e toner Konica ficaram fora desse modelo por decisao da Emenda 1 do ADR-009, que hoje precisa ser parcialmente revertida para consumiveis de canal.

O problema do agregado e estrutural: `GET /api/stock-items` (`routes/stock.ts:128-133`) ja soma `garrafas.mlRemaining` quando o item tem garrafas, e cai para `currentQuantity` quando nao tem. Com cartuchos entra uma **terceira** origem de saldo na mesma coluna.

---

## 2. Decisoes

### Decisao 1: Cartucho e ativo, e a fonte de verdade do nivel

Cria-se a tabela `cartuchos`, espelhando `garrafas`, porem **generica** (serve para tinta em `ml` e toner em `pct`):

| Campo | Tipo | Papel |
|---|---|---|
| `id` | text PK | |
| `stock_item_id` | FK `stock_items` | SKU logico (`hp_tinta-cyan`, `konica_toner-cyan`) |
| `channel` | text | Canal/slot: HP `C LC M LM Y K OP`; Konica `C M Y K` |
| `unit` | text | `ml` ou `pct` (declarado **por cartucho**, nao por item) |
| `level_initial` | real | Capacidade cheia declarada no cadastro |
| `level_current` | real | Fonte de verdade do nivel **corrente** |
| `level_capacity` | real | Capacidade nominal do cartucho (775 ml HP, 100 % Konica) |
| `state` | text | `NEW \| IN_USE \| USED \| SCRAPPED` |
| `location` | text | `deposito \| machine:<id> \| discarded \| cliente` |
| `machine_id` | FK machines | Preenchido so em `IN_USE` |
| `cartridge_code` | text | Part number digitado pelo operador (**so HP**) |
| `telemetry_sku` | text | SKU lido da pagina de device web (auditoria de divergencia) |
| `last_telemetry_at` | integer | Epoch ms da ultima leitura |
| `opened_at` / `finished_at` / `created_at` | integer | Auditoria |

`stock_items.currentQuantity` **nao e mais a verdade** para item com cartucho. Para item sem ativo (folha, solvente, resma) continua sendo a verdade.

### Decisao 2: Saldo derivado, nao coluna agregada

`saldoDerivado(stockItemId)` em `backend/src/lib/ink-balance.ts`:

```
saldo = SUM(cartuchos.level_current) onde state IN ('NEW','IN_USE')
```

Retorna **`number | null`**: `null` quando o item nao tem nenhum cartucho (ou seja, "nao rastreado por cartucho"), `0` quando tem cartucho e a soma e zero. A distincao e obrigatoria: sem ela, folha e solvente seriam reportados como "Tinta C esgotada" pelo alerta global.

`GET /api/stock-items` passa a ter **quatro** origens de saldo, avaliadas nesta ordem: bobinas -> garrafas -> cartuchos -> `currentQuantity`. Cada origem so e usada se o item tiver ativo daquele tipo.

### Decisao 3: A baixa acontece **na troca**, integral e unica

Esta e a decisao mais travada desta ADR. O operador confirmou:

> "saiu da maquina e lixo"

Portanto:

1. **Carregar nao baixa.** Entrar em `IN_USE` nao gera `OUT` e nao mexe no ledger. O cartucho ja foi baixado do estoque quando foi cadastrado como `NEW` (ou quando o operador lancou a compra).
2. **Trocar baixa 100% do que sobrou.** O cartucho anterior vai para `state = USED`, `location = discarded` e gera **exatamente uma** linha `OUT` em `stock_transactions` por `level_current` restante.
3. **Nao existe devolucao.** Nao ha `RETURN_TO_STOCK`, nao ha "trocar sem baixa", nao ha "guardar o restante". O cartucho trocado e descartado mesmo que esteja com 90% de carga. Quem quiser reciclar e problema de almoxarifado, nao de estoque.

Consequencia contabil explicita: uma troca gera um `OUT` deMl que pode ser muito menor que o consumo do periodo, porque o operador troca por-vontade (cor errada, canal sujo) e nao por fim de vida. **Isso e aceitavel e e o preco da rastreabilidade** que o operador pediu: o ledger registra "descartei o que estava na maquina", nao "consumi X ml".

`stock_transactions.source` distingue a origem: `cartucho_swap` (troca) e `cartucho_manual` (lancamento do operador).

### Decisao 4: Telemetria reconcilia o ativo carregado

A telemetria **atualiza `level_current`** do cartucho `IN_USE` do canal. Ela nao cria cartucho e nao escreve em `currentQuantity` quando existe `IN_USE` no canal.

- **HP Latex 330:** 7 canais (`C`, `LC`, `M`, `LM`, `Y`, `K`, `OP`), unidade `ml`, capacidade **775 ml**. A capacidade vem da pagina de device web; `DEFAULT_INK_CAPACITY_ML = 775` e fallback quando a pagina nao traz a informacao.
- **Konica AccurioPrint:** 4 canais CMYK, unidade `pct`, capacidade 100.

**Guarda de divergencia (obrigatoria):** se o SKU lido da pagina de device web (`telemetry_sku`) nao bater com o `stock_item_id` do cartucho `IN_USE` no canal, a telemetria e gravada em `machine_telemetry` (historico) mas **nao** em `cartuchos.level_current`, e o sistema emite aviso de divergencia. Sem essa guarda, trocar fisicamente o cartucho na maquina sem dar baixa no sistema faz a telemetria do cartucho A escrever por cima do cartucho B, e o estoque mente silenciosamente.

**Konica e estimado:** `TONER_EXPOSED = false` nao muda. O consumo por job do toner e estimado por paginas, com `attribution = 'estimated'`. A atribuicao exata so existe para HP, onde o job traz a contagem de cada canal.

### Decisao 5: Consumo manual por codigo, so onde existe codigo

O dialogo de consumo manual em `/tintas` busca por `stock_items.code`. Como **toner Konica nao tem codigo OEM rastreavel na base** (o item fica com `code = NULL`), o launcher esconde o atalho de lancamento manual para esses itens e mostra, no lugar:

> "Toner e monitorado pela telemetria. O sistema avisa quando precisar comprar e nao houver estoque."

Escrever codigo OEM de toner Konica sem fonte oficial seria inventar dado (a pendencia que motivou este registro). `stock_items.code` ganha unique index para que o launcher seja inequivoco.

### Decisao 6: BR-013 nao conflita

BR-013 ("toner nao e debitado por job") continua **IMPLEMENTED** e verdadeira. O que muda e que agora existe **ativo** e **aviso de reposicao**, nao debito por job.

### Decisao 7: Alerta de reposicao e **substituicao** de dois alertas, nao adicao

`checkLowToner()` (que dispara em `<= 15%` **incondicionalmente**, ou seja, avisa "considere reposicao" mesmo com toner `FULL` na prateleira) e **removida**. O operador rejeitou exatamente esse comportamento.

`checkReposicaoCartuchos()` e a unica fonte de aviso de consumivel de canal:

- Limiar: `pct = level_current / level_capacity * 100 <= 15`. Vale para HP e Konica porque `level_capacity` e declarado por cartucho.
- **Gate de estoque:** se existe **qualquer** cartucho do mesmo `stock_item_id` com `state = 'NEW'` em deposito, **nao avisa**. O alerta so existe quando o operador realmente precisa comprar.
- Chave de dedupe por **cartucho** (`reposicao-<cartuchoId>`), nao por item: duas maquinas com o mesmo toner avisam separado, porque esgotar em uma nao significa esgotar na outra.
- Cooldown reaproveitado: `shouldAlert`/`markAlerted`, `ALERT_COOLDOWN_MS = 30_600_000` (30 min). O `Map` e em memoria, entao reinicio do backend re-avisa. Heranca do codigo atual, aceita aqui explicitamente.
- Entrega por `emitSystemMessage()` na room `geral`, no mesmo caminho de hoje. Sem WhatsApp novo, sem compra automatica, sem ponto de pedido calculado por consumo.

`checkLowStock()` e **reescrito** para ler `saldoDerivado()` em vez de `currentQuantity` para item com cartucho. Sem isso, apos o cutover o alerta global passaria a anunciar "[Estoque Zerado]" para tinta que tem 4 cartuchos cheios na prateleira.

---

## 3. Contrato de API (fechado antes do codigo)

| Rota | Metodo | Papel |
|---|---|---|
| `/api/machines/:id/active-cartucho` | POST | carrega/troca o cartucho de um canal; gera o `OUT` na troca |
| `/api/machines/:id/cartuchos/:cartuchoId/consumo` | POST | lancamento manual (so item com `code`) |
| `/api/machines/:id/cartuchos/consumo` | GET | historico de consumo do canal |
| `GET /api/machines/:id` | GET | inclui `activeCartuchos[]` |

Sem header de idempotencia nesta fase; a unicidade e garantida por constraint (`UNIQUE (machine_id, channel)` para `IN_USE`) e por transacao unica no `INSERT` da baixa.

---

## 4. Riscos aceitos

1. **Troca antecipada gera `OUT` menor que o consumo do periodo.** Aceito: e o preco da rastreabilidade (Decisao 3). Explicado na mesma secao.
2. **Cooldown em memoria reinicia com o backend.** Aceito, heranca do `Map` atual.
3. **Divergencia SKU cartucho x pagina de device.** Mitigada pela guarda da Decisao 4 (aviso, sem sobrescrever). Risco residual: enquanto o operador nao corrigir, o `level_current` daquele canal fica congelado no ultimo valor aceito.
4. **Rollback do cutover.** Os cartuchos em deposito sao `NEW`; para voltar ao agregado basta um `ADJUSTMENT` em `currentQuantity` e ignorar `cartuchos`. O schema e aditivo (tabelas novas + 2 colunas), entao nao ha `DROP` no rollback.

---

## 5. Verificacao

- [ ] Teste prende: saldo derivado retorna `null` (sem ativo) e `0` (ativo zerado) — BR-052.
- [ ] Teste prende: carregar cartucho **nao** gera `OUT`; trocar gera **exatamente uma** linha `OUT` com `source = 'cartucho_swap'` — BR-052.
- [ ] Teste prende: cartucho trocado fica `USED` + `discarded` e **nao** volta para `deposito` — BR-052.
- [ ] Teste prende: telemetria com SKU divergente nao sobrescreve `level_current` — BR-052.
- [ ] Teste prende: `checkReposicaoCartuchos` avisa a 15%, nao avisa com saldo em deposito, nao avisa acima do limiar, respeita cooldown e emite 1 aviso por cartucho — BR-054.
- [ ] Teste prende: `checkLowToner` deixou de existir e `checkLowStock` usa `saldoDerivado()` - BR-054.
---

## Emenda 1 - Erratas de implementacao (2026-10-02)

Escritas **apos** as Tasks 2-6, quando o codigo contrastou com o texto acima. O texto
original fica preservado; esta emenda registra onde a implementacao foi mais correta
(ou mais honesta) que a decisao escrita.

### 1. `stock_items.code` NAO ganha indice UNIQUE

O texto dizia "ganha unique index para que o launcher seja inequivoco". **Nao e possivel**:
`scripts/seed-hp-materials.ts` ja grava `011983` em RP420 0,76 m e 1,52 m, e `0229` em
DE530 0,76 m e 1,52 m. Um indice UNIQUE reprovaria a migration `0012` em qualquer banco
semeado, inclusive no banco de producao.

Adotado: indice **nao unico** em `code` + `resolveItemByCode()` lanca `CodigoAmbíguoError`
carregando os candidatos, e a rota responde **409** com a lista para o operador escolher.
A inequivocidade vem do software recusando adivinhar (BR-010), nao do banco proibindo
o dado. `cartuchos.cartridge_code` tambem e nao unica: o mesmo part number e aceito em
varias unidades fisicas.

### 2. Capacidade HP e constante, nao vem da pagina

O texto dizia "a capacidade vem da pagina de device web, com fallback de 775". A pagina
nao traz capacidade: ela expoe apenas `remainingMl` por canal (ja era 775 hardcoded no
scraper atual, sem fonte). `DEFAULT_INK_CAPACITY_ML = 775` em
`agents/hp-latex/constants.ts` e a **unica** fonte do valor; a rota de cadastro usa 775
para `ml` e 100 para `pct` quando `levelCapacity` nao vem no payload. Capacidade real
so entra por cadastro manual do operador.

### 3. `saldoDerivado` distingue `null` de `0` (confirmado em codigo)

`null` = item sem nenhum cartucho (folha, solvente) -> o caller le `currentQuantity`.
`0` = item com cartucho e soma zero -> item esgotado. `SUM` de conjunto vazio devolve
`0` em SQL, entao a distincao precisa vir de um `COUNT(*)` no mesmo SELECT.

`cartuchosEmDeposito` exige `state = 'NEW'` **e** `location = 'deposito'`: um `NEW`
apontando para maquina e residuo de link errado e nao pode satisfazer o gate de BR-054.

### 4. Rigor de validacao: o Zod e o portao, nao o JSON Schema

O AJV do Fastify roda com `coerceTypes: 'array'` e `removeAdditional: true`.
Verificado empiricamente nesta maquina: `{"levelInitial": null}` vira `0`,
`{"levelInitial": [5]}` vira `5`, e `oldAction` e apagado em silencio. Por isso os
numericos **nao** declaram `type: 'number'` no JSON Schema e sao validados por
`z.number().finite()` (R-013) no handler. O ajv global nao foi mexido porque
`PATCH /api/stock-items/:id` faz `{...existing, ...data}` e `removeAdditional: false`
passaria a escrever campo desconhecido na linha.

Consequencia aceita: `oldAction: RETURN_TO_STOCK` nao devolve 400, e sim 200 com o
cartucho descartado. A garantia e de **estado** (sai `USED` + `discarded`, sem caminho de
codigo que devolva), nao de status code.