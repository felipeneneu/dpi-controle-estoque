# Plano: Correção da Página Mimaki - Jobs e Materiais

## Resumo dos Problemas Identificados

### Problema 1: Jobs Não Aparecem na Página Mimaki
**Causa Raiz:** O componente `JobsTab` está sendo usado para todas as máquinas, incluindo Mimaki. Ele consulta `print_jobs` (tabela HP/Konica), mas jobs Mimaki estão em `mimaki_jobs`.

**Resultado:** Jobs Mimaki nunca são exibidos na aba "Jobs".

### Problema 2: Materiais como "Desconhecido"
**Causa:** O campo `raw_material_name` está `NULL` para muitos jobs porque o Mimaki Tracker Electron não está enviando esse dado.

**Resultado:** Jobs ficam com status `PENDING_BIND` e material "desconhecido".

### Problema 3: Não é Possível Adicionar Materiais pela Aba
**Causa:** A aba "Materiais" só mostra materiais já vinculados, sem opção de adicionar novos.

**Resultado:** Usuário precisa voltar ao grid principal para adicionar materiais.

---

## Fase 0: Verificação de Contexto

### Arquivos Críticos Identificados

| Arquivo | Problema |
|---------|----------|
| `src/app/(dashboard)/maquinas/page.tsx` | Usa `JobsTab` para todas as máquinas (linha 521) |
| `src/components/mimaki-jobs-tab.tsx` | Existe mas NÃO está importado/usado |
| `src/components/mimaki-jobs-table.tsx` | Componente da tabela Mimaki |
| `src/components/mimaki-bind-dialog.tsx` | Diálogo de vinculação de material |
| `src/components/machine-materiais-tab.tsx` | Código morto (importado mas não renderizado) |
| `backend/scripts/_tmp.cjs` | Script de investigação do banco |

### Estado do Banco de Dados

- **Tabela `mimaki_jobs`**: Existe no Turso (confirmado via script `_tmp.cjs`)
- **Jobs existentes**: 69 jobs confirmados
- **`raw_material_name`**: NULL para a maioria dos jobs
- **Migration**: NÃO existe arquivo de migration para `mimaki_jobs`

---

## Fase 1: Perguntas de Clarificação (Respondidas)

### Respostas Obtidas

1. **Sobre o Mimaki Tracker:**
   - ✅ **RESPOSTA:** O tracker JÁ envia `raw_material_name`
   - O problema pode estar no campo ou na configuração
   - Verificar se o nome do material corresponde ao cadastrado no estoque

2. **Sobre a Aba Materiais:**
   - ✅ **RESPOSTA:** Mostrar apenas materiais `PAPER_MEDIA` (mídias para impressão)
   - Filtrar por `category = 'PAPER_MEDIA'`
   - Permitir busca por nome

3. **Sobre a Prioridade:**
   - ✅ **RESPOSTA:** Corrigir AMBOS os problemas ao mesmo tempo

---

## Fase 2: Estrutura do Plano

### Tarefa 1: Corrigir Aba Jobs para Mimaki
**Arquivo:** `src/app/(dashboard)/maquinas/page.tsx`

**Mudanças:**
1. Importar `MimakiJobsTab` de `@/components/mimaki-jobs-tab`
2. Atualizar a renderização condicional na aba "Jobs":

```tsx
// ANTES (incorret):
<TabsContent value="jobs">
  <JobsTab machine={machine} />
</TabsContent>

// DEPOIS (correto):
<TabsContent value="jobs">
  {isMimaki(machine) ? (
    <MimakiJobsTab machine={machine} />
  ) : (
    <JobsTab machine={machine} />
  )}
</TabsContent>
```

**Esforço:** 5 minutos

---

### Tarefa 2: Criar Migration para mimaki_jobs
**Arquivo Novo:** `backend/drizzle/0009_add_mimaki_jobs.sql`

**Conteúdo:**
```sql
CREATE TABLE IF NOT EXISTS `mimaki_jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `machine_id` text NOT NULL,
  `folder_timestamp` text NOT NULL,
  `job_name` text NOT NULL,
  `order_code` text,
  `quantity_units` integer NOT NULL DEFAULT 1,
  `pages` integer NOT NULL DEFAULT 1,
  `width_mm` real NOT NULL,
  `height_mm` real NOT NULL,
  `ink_cyan_cc` real DEFAULT 0,
  `ink_magenta_cc` real DEFAULT 0,
  `ink_yellow_cc` real DEFAULT 0,
  `ink_black_cc` real DEFAULT 0,
  `ink_white1_cc` real DEFAULT 0,
  `ink_white2_cc` real DEFAULT 0,
  `ink_varnish1_cc` real DEFAULT 0,
  `ink_varnish2_cc` real DEFAULT 0,
  `ink_total_cc` real DEFAULT 0,
  `raw_material_name` text,
  `length_meters` real,
  `material_status` text DEFAULT 'PENDING_BIND',
  `stock_item_id` text,
  `created_at` integer,
  FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE INDEX IF NOT EXISTS `mimaki_jobs_machine_idx` ON `mimaki_jobs` (`machine_id`);
CREATE UNIQUE INDEX IF NOT EXISTS `mimaki_jobs_folder_ts_idx` ON `mimaki_jobs` (`folder_timestamp`);
```

**Esforço:** 10 minutos

---

### Tarefa 3: Adicionar Botão "Adicionar Material" na Aba Materiais
**Arquivo:** `src/app/(dashboard)/maquinas/page.tsx` (função `MateriaisTab`)

**Mudanças:**
1. Adicionar estado para controlar o diálogo de adição
2. Criar componente `AddMaterialDialog` que mostra lista de materiais disponíveis
3. Adicionar botão "Adicionar Material" no cabeçalho da aba
4. Implementar lógica para vincular material à máquina

**Componente Novo:** `src/components/add-material-dialog.tsx`

**Funcionalidades:**
- Lista todos os stock items (ou apenas PAPER_MEDIA)
- Permite busca/filtro
- Mostra materiais já vinculados (desabilitados)
- Permite selecionar múltiplos materiais
- Chama `useUpdateMachineMaterials()` para salvar

**Esforço:** 30 minutos

---

### Tarefa 4: Melhorar Diálogo de Vinculação de Material
**Arquivo:** `src/components/mimaki-bind-dialog.tsx`

**Mudanças:**
1. Melhorar UX do diálogo
2. Adicionar busca por nome
3. Mostrar quantidade disponível em estoque
4. Confirmar antes de vincular

**Esforço:** 20 minutos

---

### Tarefa 5: Atualizar Tipos no Frontend
**Arquivo:** `src/lib/queries/mimaki.ts`

**Mudanças:**
1. Adicionar tipo `MimakiJob` mais completo
2. Garantir que todos os campos estão tipados
3. Adicionar campos de auditoria se necessário

**Esforço:** 10 minutos

---

### Tarefa 6: Limpar Código Morto
**Arquivo:** `src/components/machine-materiais-tab.tsx`

**Mudanças:**
1. Verificar se o arquivo está sendo usado
2. Se não estiver, removê-lo para evitar confusão
3. Atualizar imports se necessário

**Esforço:** 5 minutos

---

### Tarefa 7: Testar Integração Completa
**Verificação:**
1. Enviar job via Mimaki Tracker
2. Verificar se job aparece na aba "Jobs"
3. Verificar se material está como "Pendente"
4. Vincular material manualmente
5. Verificar se material muda para "Vinculado"
6. Testar aba "Consumo" com dados reais
7. Testar adição de material pela aba "Materiais"

**Esforço:** 20 minutos

---

## Fase 3: Cronograma de Implementação

| # | Tarefa | Dependências | Estimativa |
|---|--------|--------------|------------|
| 1 | Corrigir abas Jobs para Mimaki | Nenhuma | 5 min |
| 2 | Criar migration mimaki_jobs | Nenhuma | 10 min |
| 3 | Adicionar botão "Adicionar Material" | Tarefa 1 | 30 min |
| 4 | Melhorar diálogo de vinculação | Tarefa 1 | 20 min |
| 5 | Atualizar tipos frontend | Nenhuma | 10 min |
| 6 | Limpar código morto | Nenhuma | 5 min |
| 7 | Testar integração | Todas | 20 min |

**Total Estimado:** ~100 minutos

---

## Fase 4: Verificação

### Checklist de Validação

- [ ] **Aba Jobs Mimaki**: Lista jobs da tabela `mimaki_jobs`
- [ ] **Nomes dos jobs**: Exibe `jobName` corretamente (não "desconhecido")
- [ ] **Status do material**: Mostra "Vinculado" ou "Pendente"
- [ ] **Vinculação de material**: Diálogo funciona para vincular material
- [ ] **Aba Materiais**: Botão "Adicionar Material" funciona
- [ ] **Busca de materiais**: Filtro por nome funciona
- [ ] **Materiais já vinculados**: Aparecem desabilitados na lista
- [ ] **Consumo**: Dados aparecem na aba "Consumo"
- [ ] **TypeScript**: `npm run typecheck` sem erros
- [ ] **Build**: `npm run build` bem-sucedido

### Cenários de Teste

1. **Job com material conhecido:**
   - Tracker envia `raw_material_name: "LONA 280G"`
   - Job aparece com material "LONA 280G" e status "Vinculado"

2. **Job com material desconhecido:**
   - Tracker envia `raw_material_name: null`
   - Job aparece com material "Não vinculado" e status "Pendente"
   - Usuário pode vincular manualmente

3. **Adição de material:**
   - Usuário clica "Adicionar Material"
   - Seleciona material da lista
   - Material aparece na aba "Materiais"

---

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Descrição |
|---------|-----------|
| `backend/drizzle/0009_add_mimaki_jobs.sql` | Migration para tabela mimaki_jobs |
| `src/components/add-material-dialog.tsx` | Diálogo para adicionar materiais |

### Modificar
| Arquivo | Mudanças |
|---------|----------|
| `src/app/(dashboard)/maquinas/page.tsx` | Importar MimakiJobsTab, adicionar botão de material |
| `src/components/mimaki-bind-dialog.tsx` | Melhorar UX |
| `src/lib/queries/mimaki.ts` | Atualizar tipos |

### Verificar
| Arquivo | Ação |
|---------|------|
| `src/components/machine-materiais-tab.tsx` | Verificar se está em uso |

---

## Referências

- **Investigação anterior:** `backend/scripts/_tmp.cjs`
- **Plano existente:** `PLAN-MIMAKI-FIX.md`
- **Componentes Mimaki:** `src/components/mimaki-*.tsx`
- **Backend Mimaki:** `backend/src/routes/mimaki.ts`
- **Schema:** `backend/src/db/schema.ts` (linhas 233-260)

---

## Nota Importante

O principal problema é que o componente `MimakiJobsTab` já existe e funciona, mas **não está sendo importado** na página principal. A correção mais simples é importar e usar condicionalmente.

O segundo problema (material desconhecido) é uma questão de configuração do Mimaki Tracker Electron - o tracker precisa enviar `raw_material_name` no payload.
