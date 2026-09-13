# Plano de Correção: Mimaki Integration + Páginas Separadas por Máquina

## Resumo dos Problemas Identificados

### Problema 1: Jobs Não Aparecem no UI
- **Causa**: O `machine-jobs-tab.tsx` usa `useJobs()` que consulta `GET /api/jobs` → tabela `print_jobs`
- **Mimaki jobs** estão na tabela `mimaki_jobs` (69 jobs confirmados no Turso)
- **Solução**: Criar componente `MimakiJobsTab` que consulta `useMimakiJobs()`

### Problema 2: Consumo Não Reflete Mimaki
- **Causa**: O endpoint `GET /api/reports/consumption` (`reports.ts`) só consulta `print_jobs`
- **Mimaki** tem consumo em cc (tinta) e metros (mídia), não em ml/m² como HP
- **Solução**: Atualizar `reports.ts` para incluir dados de `mimaki_jobs`

### Problema 3: Usuário Quer Páginas Separadas por Máquina
- **Estrutura atual**: `/maquinas/page.tsx` com tudo junto
- **Estrutura desejada**: `/maquinas/mimaki/[id]/page.tsx`, `/maquinas/hp/[id]/page.tsx`, etc.
- **Solução**: Criar rotas aninhadas com layout compartilhado

---

## Fase 1: Corrigir Backend - Relatório de Consumo

### Arquivo: `grafica-app/backend/src/routes/reports.ts`

**Mudanças necessárias:**
1. Importar `mimakiJobs` do schema
2. Consultar `mimaki_jobs` quando a máquina é Mimaki
3. Retornar `mimakiTotals` separado (ink em cc, length em metros)
4. Atualizar `ConsumptionReport` no frontend

**Código a adicionar:**
```typescript
// Após linha 52, adicionar consulta para Mimaki
let mimakiRows: MimakiJob[] = [];
if (query.machineId) {
  const machine = await db.select().from(machines).where(eq(machines.id, query.machineId)).get();
  if (/mimaki/i.test(machine?.brand ?? '')) {
    mimakiRows = await db
      .select()
      .from(mimakiJobs)
      .where(
        and(
          eq(mimakiJobs.machineId, query.machineId),
          gte(mimakiJobs.createdAt, start),
          lt(mimakiJobs.createdAt, end),
        )
      )
      .all();
  }
}

// Calcular totais Mimaki
const mimakiTotals = {
  jobs: mimakiRows.length,
  lengthMeters: mimakiRows.reduce((a, r) => a + (r.lengthMeters ?? 0), 0),
  inkTotalCc: mimakiRows.reduce((a, r) => a + (r.inkTotalCc ?? 0), 0),
  inkCyanCc: mimakiRows.reduce((a, r) => a + (r.inkCyanCc ?? 0), 0),
  inkMagentaCc: mimakiRows.reduce((a, r) => a + (r.inkMagentaCc ?? 0), 0),
  inkYellowCc: mimakiRows.reduce((a, r) => a + (r.inkYellowCc ?? 0), 0),
  inkBlackCc: mimakiRows.reduce((a, r) => a + (r.inkBlackCc ?? 0), 0),
  inkWhite1Cc: mimakiRows.reduce((a, r) => a + (r.inkWhite1Cc ?? 0), 0),
  inkWhite2Cc: mimakiRows.reduce((a, r) => a + (r.inkWhite2Cc ?? 0), 0),
  inkVarnish1Cc: mimakiRows.reduce((a, r) => a + (r.inkVarnish1Cc ?? 0), 0),
  inkVarnish2Cc: mimakiRows.reduce((a, r) => a + (r.inkVarnish2Cc ?? 0), 0),
};

// Adicionar mimakiTotals ao retorno
return {
  month,
  machineId: query.machineId ?? null,
  machineName,
  isKonica,
  totals,
  konicaTotals,
  mimakiTotals,  // NOVO
  byMedia: [...],
};
```

---

## Fase 2: Criar Componentes Mimaki para Jobs

### Arquivo Novo: `grafica-app/src/components/mimaki-jobs-tab.tsx`

**Funcionalidades:**
- Busca jobs via `useMimakiJobs({ machine_id: machine.id })`
- Filtros por data, status, material
- Paginação
- Botão para vincular material (abre `MimakiBindDialog`)

### Arquivo Novo: `grafica-app/src/components/mimaki-jobs-table.tsx`

**Colunas específicas Mimaki:**
- Data/Hora
- Nome do Job
- OS (se houver)
- Material Bruto
- Comp. (metros)
- Status (Vinculado/Pendente)
- Ações (Vincular)

### Arquivo Novo: `grafica-app/src/components/mimaki-consumo-tab.tsx`

**Dados a exibir:**
- Total de jobs
- Total de metros impressos
- Total de tinta (cc) por cor
- Consumo por tipo de material

---

## Fase 3: Criar Rotas Aninhadas para Máquinas

### Estrutura de Arquivos:
```
grafica-app/src/app/(dashboard)/maquinas/
├── page.tsx                    ← Grid de máquinas (redireciona para sub-página)
├── layout.tsx                  ← Layout compartilhado (breadcrumb, voltar)
├── mimaki/
│   └── [id]/
│       └── page.tsx            ← Página específica Mimaki
├── hp-latex/
│   └── [id]/
│       └── page.tsx            ← Página específica HP Latex
└── accurio/
    └── [id]/
        └── page.tsx            ← Página específica Accurio/Konica
```

### Mudanças na Página Principal (`maquinas/page.tsx`):

1. Manter o grid de cards
2. Alterar o link "Canal" para apontar para a sub-página correta:
   - Mimaki: `/maquinas/mimaki/${machine.id}`
   - HP: `/maquinas/hp-latex/${machine.id}`
   - Accurio: `/maquinas/accurio/${machine.id}`

### Página Mimaki (`maquinas/mimaki/[id]/page.tsx`):

**Tabs:**
1. **Status** - `MimakiInfoPanel` (informações M2M, jobs pendentes)
2. **Jobs** - `MimakiJobsTab` (lista completa com filtros)
3. **Consumo** - `MimakiConsumoTab` (tinta cc, metros)
4. **Materiais** - `MateriaisTab` (compartilhado)

### Página HP Latex (`maquinas/hp-latex/[id]/page.tsx`):

**Tabs:**
1. **Status** - `MachineTelemetryPanel` (telemetria em tempo real)
2. **Jobs** - `JobsTab` (print_jobs)
3. **Consumo** - `ConsumoTab` (tinta ml, m²)
4. **Materiais** - `MateriaisTab` (compartilhado)

### Página Accurio (`maquinas/accurio/[id]/page.tsx`):

**Tabs:**
1. **Status** - `KonicaTelemetryPanel` (telemetria Konica)
2. **Jobs** - `JobsTab` (print_jobs)
3. **Consumo** - `KonicaConsumoTab` (páginas, folhas)
4. **Materiais** - `MateriaisTab` (compartilhado)

---

## Fase 4: Atualizar Tipos e Hooks

### Atualizar `grafica-app/src/lib/queries/reports.ts`:

```typescript
export interface MimakiTotals {
  jobs: number
  lengthMeters: number
  inkTotalCc: number
  inkCyanCc: number
  inkMagentaCc: number
  inkYellowCc: number
  inkBlackCc: number
  inkWhite1Cc: number
  inkWhite2Cc: number
  inkVarnish1Cc: number
  inkVarnish2Cc: number
}

export interface ConsumptionReport {
  // ... existente
  mimakiTotals?: MimakiTotals  // NOVO
}
```

### Atualizar `grafica-app/src/lib/api.ts`:

Adicionar função helper:
```typescript
export function isMimakiMachine(m: Machine): boolean {
  return /mimaki/i.test(m.brand);
}
```

---

## Fase 5: Testes e Validação

### Checklist:
- [ ] Backend: `GET /api/reports/consumption` retorna `mimakiTotals` para máquinas Mimaki
- [ ] Frontend: `MimakiJobsTab` lista jobs de `mimaki_jobs`
- [ ] Frontend: `MimakiConsumoTab` exibe consumo em cc/metros
- [ ] Frontend: Navegação funciona para todas as rotas aninhadas
- [ ] Frontend: Breadcrumb mostra caminho correto
- [ ] Frontend: Botão "Voltar" funciona em todas as páginas
- [ ] TypeScript compila sem erros
- [ ] ESLint passa

### Teste com Dados Reais:
1. Enviar jobs via Mimaki Tracker
2. Verificar se jobs aparecem na aba "Jobs" da página Mimaki
3. Verificar se consumo é exibido corretamente
4. Testar vinculação de material

---

## Ordem de Implementação

1. **Fase 1** (Backend): Atualizar `reports.ts` para incluir Mimaki
2. **Fase 2** (Frontend): Criar componentes Mimaki (jobs, consumo)
3. **Fase 3** (Frontend): Criar rotas aninhadas
4. **Fase 4** (Frontend): Atualizar tipos e hooks
5. **Fase 5** (Teste): Validar com dados reais

---

## Arquivos a Criar/Modificar

### Criar:
- `grafica-app/src/components/mimaki-jobs-tab.tsx`
- `grafica-app/src/components/mimaki-jobs-table.tsx`
- `grafica-app/src/components/mimaki-consumo-tab.tsx`
- `grafica-app/src/app/(dashboard)/maquinas/layout.tsx`
- `grafica-app/src/app/(dashboard)/maquinas/mimaki/[id]/page.tsx`
- `grafica-app/src/app/(dashboard)/maquinas/hp-latex/[id]/page.tsx`
- `grafica-app/src/app/(dashboard)/maquinas/accurio/[id]/page.tsx`

### Modificar:
- `grafica-app/backend/src/routes/reports.ts` (adicionar Mimaki)
- `grafica-app/src/app/(dashboard)/maquinas/page.tsx` (atualizar links)
- `grafica-app/src/lib/queries/reports.ts` (adicionar MimakiTotals)
- `grafica-app/src/components/mimaki-info-panel.tsx` (opcional: melhorar)
