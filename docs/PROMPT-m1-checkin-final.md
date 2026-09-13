# PROMPT — Implementar M1 (Bobina) + Check-in Corrigido (ADR-010 v2)

## Antes de começar

Leia, nesta ordem, os arquivos já existentes no repositório (não peço para colar
conteúdo aqui de propósito — leia direto do repo, pois são a fonte de verdade e podem
já ter mudado desde a última vez que alguém resumiu isso em chat):

1. `governance/RULES.md` — em especial **BR-002** (bobina como ativo) e **BR-010**
   (matcher explícito, nunca falhar em silêncio).
2. `governance/adr/ADR-009-bobina-como-ativo.md` — decisão de modelo (entidade Bobina).
3. `governance/adr/ADR-010-identificacao-bobina.md` (versão 2, já corrigida) — check-in
   via widget no canal da máquina (não é terminal separado), aviso agendado às 17:10
   Brasília, tratamento de job órfão.
4. `business/DOMAIN_MODEL.md §2` — modelo target completo (fases M1-M5), para contexto
   de onde este trabalho se encaixa.

## Escopo desta tarefa — SOMENTE M1 + check-in

Implementar:

1. **Entidade `Bobina`** (Drizzle), conforme ADR-009: `id`, `stock_item_id` (FK),
   `serial`/`codigo_curto`, `width_mm`, `meters_initial`, `meters_remaining`, `state`
   (`NEW | IN_USE | USED | BLOCKED | SCRAPPED`), `location`
   (`deposito | machine:<id> | cliente | sucata`), `bobina_opened_at`, `finished_at`.
2. **`add-roll`** (`backend/src/routes/stock.ts:289-333`) passa a criar uma `Bobina`
   nova (não só somar ao agregado) + gerar transação IN de abertura vinculada a ela.
3. **`StockItem.currentQuantity` exibido na UI** vira derivado: soma de
   `meters_remaining` das bobinas em estado `NEW`/`IN_USE` daquele SKU — não mais uma
   coluna editável diretamente na tela.
4. **Widget "Bobina ativa" dentro do canal de cada máquina** (mesma tela mostrada em
   `#HP Latex 330`, `#Mimaki UCJV300-75`, etc. — ver estrutura de canais existente no
   frontend): mostra bobina atual (`#id — SKU — Xm restantes`) + botão "Trocar bobina"
   que abre campo para digitar/colar ID curto e confirmar. Ao confirmar, muda
   `state = IN_USE` e `location = machine:<id>` daquela bobina.
5. **Estado de Job Órfão (`PENDENTE_VINCULO`)**, conforme ADR-010: se o agente
   (HP/Mimaki) detectar consumo sem bobina `IN_USE` vinculada àquela máquina, registra o
   consumo mesmo assim, marca o job como pendente, **não bloqueia a produção**. Exibir
   alerta não intrusivo no canal daquela máquina.
6. **Resolução de órfão**: tela/ação para o operador apontar retroativamente a bobina
   correta, ou "vincular à última bobina utilizada" — com aviso de que esse atalho pode
   errar se houve mais de uma troca não registrada em sequência.
7. **Alerta agendado às 17:10 (horário de Brasília)**: varre jobs com bobina não
   vinculada / `Debitado = Não` e dispara notificação, reaproveitando o sistema de
   notificação já existente (toast + WhatsApp).
8. **Fator de ajuste de sangria/avanço**: campo configurável por máquina (ex:
   `+0.4m por job`) aplicado no `stock-deductor.ts` de HP e Mimaki, conforme ADR-010
   seção de trade-offs.

## Fora de escopo nesta tarefa (não implementar agora)

- Geração de etiquetas (QR + `pdf-lib`) — tarefa separada, depende desta ser concluída
  primeiro (precisa da entidade `Bobina` e do ID curto existindo).
- Parser de ID de bobina no nome do arquivo (`vinil-1040-...`) — tarefa separada,
  também depende desta primeiro.
- Dedução por bobina no Konica — **não se aplica** (papel é material discreto, BR-013,
  continua no modelo agregado por SKU).
- RFID/leitor físico (M5) — fora de escopo, é evolução futura.

## Critérios de aceite

- [ ] `add-roll` cria bobina individual + transação IN de abertura.
- [ ] Tela de estoque mostra bobinas separadas por SKU, não mais um agregado só.
- [ ] Widget de bobina ativa aparece em cada canal de máquina, com troca funcional.
- [ ] Job sem bobina vinculada não trava produção; aparece como pendente, resolvível
      depois.
- [ ] Alerta às 17:10 (Brasília) dispara quando há pendências do dia.
- [ ] Fator de ajuste de sangria é configurável por máquina, não hardcoded.
- [ ] Nenhuma mudança na Konica (papel continua no fluxo agregado atual).