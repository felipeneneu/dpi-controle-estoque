# Plano de Ação: M1 Bobina + Check-in Corrigido (ADR-010/013)

## 0. Setup
- [ ] Criar branch `feature/m1-bobina-checkin`.

## 1. Banco de Dados (Schema)
Arquivo: `backend/src/db/schema.ts`
- [ ] Adicionar tabela `bobinas`:
  - `id` (text, uuid)
  - `stockItemId` (text, FK para `stockItems`)
  - `serial` (text)
  - `widthMm` (real)
  - `metersInitial` (real)
  - `metersRemaining` (real)
  - `state` (text enum: `NEW`, `IN_USE`, `USED`, `BLOCKED`, `SCRAPPED`)
  - `location` (text)
  - `bobinaOpenedAt` (timestamp)
  - `finishedAt` (timestamp)
- [ ] Adicionar coluna `bleedAdjustmentM` (real, default 0) na tabela `machines`.
- [ ] Adicionar enum de localização: `deposito`, `machine:<id>`, `cliente`, `sucata` em tipagem auxiliar.
- [ ] Adicionar estado `PENDING_BIND` (job órfão) para jobs sem bobina vinculada.

## 2. Migração e Cutover
- [ ] Criar script/migration que:
  - Zera os saldos atuais (`currentQuantity` em `stockItems`).
  - Ou opcionalmente exclui todas as bobinas caso já existissem, garantindo um cutover limpo (conforme decisão 1: "deletar todas as bobinas e recriá-las do zero").
- [ ] Atualizar cálculo de `currentQuantity` no backend/frontend para ser sempre um valor derivado (`SUM(metersRemaining)` onde estado é `NEW` ou `IN_USE`).

## 3. Rotas Backend
Arquivo: `backend/src/routes/stock.ts` (e similares)
- [ ] Alterar o endpoint `add-roll`:
  - Ao invés de somar no `currentQuantity` do `stockItem`, ele cria um novo registro na tabela `bobinas`.
  - O estado inicial é `NEW` e o `location` é `deposito`.
  - Gera um evento/transação no ledger vinculando a essa bobina recém criada.

## 4. Frontend - Interface do Estoque
- [ ] Alterar a exibição da listagem de estoque (SKUs).
- [ ] O saldo de metros não é mais editável diretamente, e sim a soma das bobinas associadas ao SKU.
- [ ] Criar nova tabela/visualização que lista os rolos (bobinas) individuais do SKU selecionado.

## 5. Frontend - Canal da Máquina & Check-in
- [ ] Adicionar widget "Bobina ativa" dentro do canal de cada máquina (ao lado do status "Conectado").
- [ ] Exibir a bobina atualmente em uso (`location = machine:<id>`, `state = IN_USE`).
- [ ] Ação "Trocar bobina":
  - Input para digitar ID curto da nova bobina.
  - Janela de decisão (Modal) perguntando o destino da velha ("Acabou -> USED" ou "Voltou pro Estoque -> NEW/deposito") (Decisão 2B).
  - Atualizar no backend os estados/localizações.

## 6. Jobs Órfãos & Consumo
- [ ] Agentes (HP/Mimaki) tentarão buscar a bobina `IN_USE` da máquina durante o parse.
- [ ] Se não acharem, o consumo é registrado no log e o Job é marcado como órfão (`PENDENTE_VINCULO` / `PENDING_BIND`) em vez de falhar.
- [ ] UI de canal: mostrar os jobs órfãos com opção de vinculá-los a uma bobina (resolução retroativa).
- [ ] Lógica de consumo: abater a metragem (`metersRemaining`) apenas da bobina selecionada, em vez do agregado.

## 7. Fator de Sangria (Avanço)
- [ ] UI de Máquinas: Adicionar campo para editar "Fator de Sangria/Avanço (m)". (Decisão 3A).
- [ ] Agentes (HP/Mimaki): usar o campo `bleedAdjustmentM` da máquina para somar no consumo de material sempre que o agent debitar a bobina.

## 8. Alerta 17:10
- [ ] Adicionar cronjob/scheduler (ex: `node-cron` ou similar dependendo da infra) que roda às 17:10 BRT.
- [ ] Ação: listar todos os jobs de HP/Mimaki do dia com status de órfão/pendente ou `Debitado = Não`.
- [ ] Disparar notificação (Toast UI e WhatsApp) avisando da pendência de verificação no sistema.
