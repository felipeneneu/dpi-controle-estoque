# Plan: Corrigir migração machine_telemetry no Turso cloud

Data: 04/09/2026

## Contexto
O banco Turso cloud não tem a tabela `machine_telemetry`. Erro ao buscar telemetria:
```
no such table: machine_telemetry
```
Além disso, pode não ter também as colunas `code`/`label` de `stock_items` — foi o que quebrou a migração 0004 na tentativa original.

## Causa raiz
A migração `0004_watery_owl.sql` encerra com:
1. `CREATE TABLE machine_telemetry` ✓ (deveria existir)
2. `ALTER TABLE stock_items ADD code` ← **quebrou aqui** (coluna code não existia → `duplicate column`? ou existia via push)
3. `ALTER TABLE stock_items ADD label`

No handler de fallback atual (`server.ts`), quando a migração quebra em "duplicate column name", o código marca **a migração inteira (idx 4) como aplicada** no `_journal`, mas a tabela `machine_telemetry` (criada ANTES do ponto de quebra) pode não ter sido criada — porque o drizzle roda a migração em **uma única transação que é revertida em caso de erro**. Ou seja, quando quebra, tudo é desfeito, inclusive o `CREATE TABLE`.

Agora o drizzle pula a 0004 (está no journal) e a tabela nunca existe.

## Tarefas

### 1. Criar migração de compensação `0005_*.sql`
- Gerar com `drizzle-kit generate` após confirmar o estado atual do schema no projeto.
- Ou escrever manualmente um SQL que apenas **cria a tabela que falta** com `CREATE TABLE IF NOT EXISTS`, sem depender das colunas que já existem.

### 2. Ajustar o fallback do `server.ts` (para não mascarar o problema)
- O handler atual captura `no such table: _journal` e `duplicate column name`.
- **Problema:** ele marca 0004 como aplicada sem garantir que todos os objetos da migração existem.
- **Fix:** em vez de marcar cegamente, garantir que as instruções principais sejam idempotentes (`CREATE TABLE IF NOT EXISTS`). Ou, robusto, comparar o schema esperado vs real e criar só o que falta.

### 3. Validar
- Reiniciar backend → migração nova aplica e cria `machine_telemetry`.
- `GET /api/machines/:id/telemetry` retorna 200 sem erro.
- Conferir que `stock_items` tem `code` e `label`.

## Critérios de aceite
- [ ] Tabela `machine_telemetry` existe no cloud.
- [ ] Endpoint de telemetria não retorna "no such table".
- [ ] `stock_items.code` e `stock_items.label` existem (sem duplicar).
- [ ] Servidor sobe limpo sem o handler de fallback ativar (migração de verdade roda).

## Notas
- A recomendação é **não** depender do fallback frágil atual. Melhor: escrever migração idempotente 0005 que garanta `machine_telemetry` e rodar drizzle normalmente.
- Se o cloud foi principalmente populado por `db:push`, considerar o `drizzle-kit push` para o schema ficar consistente (mas exige aval do usuário segundo plano-amanha.md).
