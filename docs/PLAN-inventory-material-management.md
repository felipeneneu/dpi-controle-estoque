# PLAN: Inventory Page - Material Individual com SKU, Exclusão, Busca e Alertas de Tinta

## Contexto

O usuário quer alterações na página de estoque do grafica-app:

1. **Excluir material** - botão de delete por item (restrito a DEV_MASTER/ADMIN)
2. **Não agrupar materiais** - cada material é único, mesmo nome mas SKU diferente
3. **SKU obrigatório e único** - buscar por SKU exato ou nome
4. **Baixa manual de tinta** - entrar no estoque, buscar tinta, dar baixa
5. **Remover débito automático de tinta** - Konica: remover toner, manter papel; HP: já só loga
6. **Alertas de tinta baixa via telemetria** - Konica/HP disparam notificação app + WhatsApp
7. **Exibir status individual** - "1 em uso • 2 fechadas" com drill-down

## Arquivos Principais Envolvidos

### Backend
| Arquivo | Ação |
|---------|------|
| `grafica-app/backend/src/db/schema.ts` | Modificar - `stockItems.code` unique + obrigatório, adicionar `status` (em_uso/disponivel) |
| `grafica-app/backend/src/routes/stock.ts` | Modificar - DELETE endpoint, busca melhorada, saldo individual |
| `grafica-app/backend/src/agents/konica/stock-deductor.ts` | Modificar - remover lógica toner (linhas 206-237) |
| `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts` | Verificar - confirmar que não debita tinta (ADR-057) |
| `grafica-app/backend/src/agents/brain/index.ts` | Modificar - alertas de tinta baixa via telemetria |
| `grafica-app/backend/scripts/seed-*.ts` | Modificar - popular SKUs reais |

### Frontend
| Arquivo | Ação |
|---------|------|
| `grafica-app/src/components/stock-data-table.tsx` | Modificar - exibir breakdown, expandir detalhes, botão delete |
| `grafica-app/src/components/stock-search.tsx` | Criar/Modificar - autocomplete por SKU/nome |
| `grafica-app/src/app/(dashboard)/estoque/page.tsx` | Modificar - integração novos componentes |
| `grafica-app/src/lib/api.ts` | Modificar - tipos para status individual, DELETE |
| `grafica-app/src/lib/queries/stock.ts` | Modificar - hooks para busca, delete, consumo manual |

### Database
- Migration para `stockItems.code` UNIQUE NOT NULL
- Migration para `stockItems.status` enum (em_uso, disponivel, etc)
- Índice em `lower(code)` para busca case-insensitive

## Task Breakdown

| # | Task | Agente | Depende de |
|---|------|--------|------------|
| 0 | ADR para mudança de contrato (SKU único, remoção débito automático) | documentation-writer | — |
| 1 | Schema: `code` UNIQUE NOT NULL + `status` enum | database-architect | 0 |
| 2 | Migration + seed com SKUs reais HP (CZ682A, CZ683A, etc) | database-architect | 1 |
| 3 | DELETE `/api/stock-items/:id` (DEV_MASTER/ADMIN) | backend-specialist | 1 |
| 4 | Busca melhorada: exato por SKU + autocomplete | backend-specialist | 1 |
| 5 | Remover dedução toner Konica (`stock-deductor.ts:206-237`) | backend-specialist | 0 |
| 6 | Verificar HP Latex - confirmar só log, sem débito | backend-specialist | 0 |
| 7 | Alertas telemetria tinta baixa → notificação app + WhatsApp | backend-specialist | 5,6 |
| 8 | Saldo derivado por item individual (não agregado) | backend-specialist | 1 |
| 9 | Frontend: `stock-search` com autocomplete SKU/nome | frontend-specialist | 4 |
| 10 | Frontend: `stock-data-table` - breakdown "1 em uso • 2 disponíveis" + expand | frontend-specialist | 8 |
| 11 | Frontend: botão delete + confirmação (role check) | frontend-specialist | 3 |
| 12 | Frontend: dialog consumo manual tinta (buscar por código) | frontend-specialist | 4 |
| 13 | Integração página `/estoque` | frontend-specialist | 9,10,11,12 |
| 14 | Testes: caracterização deductor Konica (antes/depois) | test-engineer | 5 |
| 15 | Testes: rota DELETE, busca, saldo individual | test-engineer | 3,4,8 |
| 16 | E2E: fluxo completo estoque → busca → baixa → alerta | test-engineer | 13 |
| 17 | Lint + typecheck + suite verde | test-engineer | 16 |

## Detalhes de Implementação

### 1. Schema Changes
```typescript
// schema.ts - stockItems
code: text('code').notNull().unique(),  // era nullable, agora obrigatório + unique
status: text('status', { enum: ['em_uso', 'disponivel', 'reservado', 'descartado'] })
  .notNull().default('disponivel'),
```

### 2. Busca Melhorada (stock.ts)
- `GET /api/stock-items?search=` - busca exata por `code` (case-insensitive) primeiro, depois por `name` ILIKE
- Retorna itens individuais com `status` e `machineId` se `em_uso`

### 3. Exibição na Tabela
```
Linha principal: "BOPP Prata 50cm" 
Badges: [1 em uso] [2 disponíveis] 
Clique → expande 3 linhas:
  • CTN-001 | em_uso | Konica #2
  • CTN-002 | disponivel | Depósito
  • CTN-003 | disponivel | Depósito
```

### 4. Remoção Débito Automático Konica
```typescript
// agents/konica/stock-deductor.ts - REMOVER linhas 206-237
// Manter apenas dedução de papel (BR-013)
```

### 5. Alertas Telemetria
- Konica: `tonerCyanPct`...`tonerBlackPct` ≤ 15% → notificação
- HP: `inkCyanMl`... / `capacityMl` ≤ 15% → notificação
- Criar `checkLowInkCartridges()` no brain, substituir `checkLowToner()`
- Emitir `systemMessage` (app) + webhook WhatsApp

### 6. Consumo Manual Tinta
- Dialog: buscar por código (exato) → mostra item → input quantidade → confirmar
- Cria `stock_transaction` type OUT + atualiza `levelCurrent` do cartucho

## Verificação (Phase X)

- [ ] `npm run lint` passa
- [ ] `npm run typecheck` passa  
- [ ] Testes unitários backend verdes
- [ ] Testes integração rotas stock verdes
- [ ] E2E: delete material, busca SKU, baixa manual, alerta telemetria
- [ ] Build production OK
- [ ] ADR atualizado e indexado

## Riscos

1. **Migração `code` unique** - dados existentes podem ter duplicatas/nulls → script de limpeza prévio
2. **Compatibilidade deductor** - jobs em andamento podem esperar débito automático → fallback temporário
3. **WhatsApp webhook** - requer config externa, mockar em dev

## Próximos Passos

1. Revisar este plano
2. Rodar `/create` para iniciar implementação (Task 0 → 17)
3. Ou modificar plano manualmente