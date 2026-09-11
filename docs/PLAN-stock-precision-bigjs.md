# Plano: Cálculo Preciso de Consumo de Estoque com big.js

## Resumo

Implementar cálculos de precisão decimal para o consumo de estoque de mídia (materiais impressos), substituindo operações IEEE 754 nativas do JavaScript por `big.js` para evitar erros de arredondamento em divisões e subtrações críticas.

**Problema Atual:**
- HP Latex fornece área em m² via accounting.xls
- Estoque é armazenado em metros lineares
- Conversão: `linearMeters = mediaAreaM2 / rollWidth`
- Exemplo: `3.5819 / 1.60 = 2.2386875000000003` (erro de ponto flutuante)
- Acúmulo de erros ao longo de múltiplas transações corrompe o estoque

**Solução:**
- Instalar `big.js` para operações de precisão arbitrária
- Criar módulo de utilidades matemáticas
- Aplicar em todos os pontos de cálculo críticos
- Adicionar campos de auditoria para rastreabilidade

---

## Fase 0: Verificação de Contexto

### Dependências Atuais
- `big.js`: ❌ NÃO instalado
- `zod`: ✅ v3.23.8 (já presente)
- `fastify-type-provider-zod`: ❌ Não instalado (mas não necessário para este escopo)

### Arquivos Críticos Identificados
| Arquivo | Função |
|---------|--------|
| `backend/src/agents/hp-latex/stock-deductor.ts` | Dedução de estoque HP (m² → m lineares) |
| `backend/src/routes/mimaki.ts` | Cálculo de comprimento Mimaki (height × pages / 1000) |
| `backend/src/routes/reports.ts` | Agregação de consumo em relatórios |
| `backend/src/db/schema.ts` | Schema das tabelas `printJobs`, `stockItems`, `stockTransactions` |

### Dados Disponíveis
- **HP**: `mediaAreaM2` (área em m²), `mediaType` (perfil de substrato), `jobName` (nome do arquivo)
- **Mimaki**: `height_mm`, `pages`, `quantity_units` (cálculo direto)
  - ⚠️ Tracker **NÃO envia largura da bobina**
  - Larguras padrão: **0,75m** (75cm) para materiais comuns, **0,60m** (60cm) para específicos
- **Estoque**: `stockItems.width` (largura da bobina em metros)

---

## Fase 1: Clarificações do Usuário (Porta de Entrada Socrática)

### Respostas Obtidas

1. **Precisão de Arredondamento:**
   - **RESPOSTA:** 3 casas decimais (milímetros) → `2.239m`
   - Exemplo: `3.5819 / 1.60 = 2.239` (não `2.238687...`)

2. **Tratamento de Defeitos:**
   - **RESPOSTA:** O que vale é o **linear consumido do rolo**
   - Se o operador informa `1,60m`, esse é o valor que sai do estoque
   - Defeitos já estão embutidos no total informado
   - Não é necessário descontar separadamente

3. **Largura da Bobina HP:**
   - **RESPOSTA:** Manter lógica atual (`jobName > mediaType > stockItem.width`)
   - A largura é resolvida dinamicamente na hora da dedução

4. **Campos de Auditoria:**
   - **RESPOSTA:** Sim, adicionar `rollWidthUsed` e `linearMetersDebited`
   - Benefício: rastreabilidade completa para reconciliação

5. **Aplicar ao Mimaki:**
   - **RESPOSTA:** Sim, aplicar big.js para consistência
   - **Dados importantes:**
     - Tracker Mimaki **NÃO envia largura da bobina**
     - Bobinas padrão: **0,75m (75cm)** de largura
     - Materiais específicos: **0,60m (60cm)**
     - Cálculo atual já é correto: `height_mm × pages × units / 1000`
     - `height_mm` já representa o comprimento linear consumido

---

## Fase 2: Estrutura do Plano

### Tarefa 1: Instalar Dependência
**Arquivo:** `grafica-app/backend/package.json`
```json
"dependencies": {
  "big.js": "^6.2.2"
},
"devDependencies": {
  "@types/big.js": "^6.0.8"
}
```
**Comando:** `npm install big.js && npm install --save-dev @types/big.js`

---

### Tarefa 2: Criar Módulo de Utilidades Matemáticas
**Arquivo Novo:** `grafica-app/backend/src/lib/math.ts`

**Responsabilidades:**
- Configurar `Big.DP = 10` (10 casas decimais internas)
- Configurar `Big.RM = Big.roundHalfUp` (arredondamento comercial)
- Exportar funções:
  - `divideAreaToLength(areaM2: number, widthM: number): number`
  - `subtractStock(current: number, deduction: number): number`
  - `sumPrecise(values: number[]): number`
  - `toPrecision(value: number, decimals: number): number`

**Exemplo de Implementação:**
```typescript
import Big from 'big.js';

Big.DP = 10;
Big.RM = Big.roundHalfUp;

export function divideAreaToLength(areaM2: number, widthM: number): number {
  if (widthM <= 0) throw new Error('Largura da bobina deve ser > 0');
  return new Big(areaM2).div(widthM).toNumber();
}

export function subtractStock(current: number, deduction: number): number {
  return Math.max(0, new Big(current).minus(deduction).toNumber());
}

export function sumPrecise(values: number[]): number {
  return values.reduce((acc, val) => new Big(acc).plus(val), new Big(0)).toNumber();
}

export function toPrecision(value: number, decimals: number): number {
  return new Big(value).round(decimals, Big.roundHalfUp).toNumber();
}
```

---

### Tarefa 3: Atualizar Stock Deductor HP
**Arquivo:** `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts`

**Mudanças:**
1. Importar funções de `../lib/math.ts`
2. Substituir divisão nativa por `divideAreaToLength()`
3. Substituir subtração nativa por `subtractStock()`
4. Usar `toPrecision()` para valores de exibição

**Linhas Específicas:**
- Linha ~167: `const debitQty = widthM ? job.mediaAreaM2 / widthM : job.mediaAreaM2;`
  - → `const debitQty = widthM ? divideAreaToLength(job.mediaAreaM2, widthM) : job.mediaAreaM2;`
- Linha ~175: `const newQty = Math.max(0, item.currentQuantity - debitQty);`
  - → `const newQty = subtractStock(item.currentQuantity, debitQty);`
- Linha ~180: `quantity: debitQty,`
  - → `quantity: toPrecision(debitQty, 3),` (armazenar com 3 casas decimais)

---

### Tarefa 4: Atualizar Rota Mimaki
**Arquivo:** `grafica-app/backend/src/routes/mimaki.ts`

**Contexto Mimaki:**
- Tracker **NÃO envia largura da bobina**
- Bobinas padrão: **0,75m (75cm)**
- Materiais específicos: **0,60m (60cm)**
- Cálculo atual já é correto: `height_mm × pages × units / 1000`
- `height_mm` já representa o comprimento linear consumido

**Mudanças:**
1. Importar `Big` ou funções de `../lib/math.ts`
2. Substituir cálculo de `lengthMeters` (linha ~82)
3. Adicionar `toPrecision()` para 3 casas decimais

**Linha Específica:**
- `const lengthMeters = (data.height_mm * data.pages * data.quantity_units) / 1000;`
  - → `const lengthMeters = toPrecision(new Big(data.height_mm).times(data.pages).times(data.quantity_units).div(1000).toNumber(), 3);`

---

### Tarefa 5: Atualizar Relatórios
**Arquivo:** `grafica-app/backend/src/routes/reports.ts`

**Mudanças:**
1. Importar `sumPrecise` de `../lib/math.ts`
2. Substituir `reduce` por `sumPrecise()` em totais

**Linhas Específicas:**
- Linha ~66: `areaM2: rows.reduce((a, r) => a + (r.mediaAreaM2 ?? 0), 0),`
  - → `areaM2: sumPrecise(rows.map(r => r.mediaAreaM2 ?? 0)),`
- Repetir para `inkTotalMl`, `inkCyanMl`, etc.

---

### Tarefa 6: Adicionar Campos de Auditoria (Opcional mas Recomendado)
**Arquivo:** `grafica-app/backend/src/db/schema.ts`

**Adicionar à tabela `printJobs`:**
```typescript
rollWidthUsed: real('roll_width_used'),        // Largura usada na conversão (m)
linearMetersDebited: real('linear_meters_debited'), // Metros lineares debitados
```

**Migration:** Criar nova migration `0008_add_audit_fields.sql`:
```sql
ALTER TABLE print_jobs ADD COLUMN roll_width_used real;
ALTER TABLE print_jobs ADD COLUMN linear_meters_debited real;
```

**Atualizar `stock-deductor.ts`:**
- Armazenar `rollWidthUsed` e `linearMetersDebited` ao debitar

---

### Tarefa 7: Testes Unitários
**Arquivo Novo:** `grafica-app/backend/src/lib/__tests__/math.test.ts`

**Casos de Teste:**
```typescript
describe('divideAreaToLength', () => {
  it('should calculate 3.5819 / 1.60 = 2.239 (not 2.238687...)', () => {
    expect(divideAreaToLength(3.5819, 1.60)).toBe(2.239);
  });

  it('should handle 4.9426 / 1.06 = 4.663', () => {
    expect(divideAreaToLength(4.9426, 1.06)).toBe(4.663);
  });

  it('should throw for width <= 0', () => {
    expect(() => divideAreaToLength(1, 0)).toThrow();
  });
});

describe('subtractStock', () => {
  it('should subtract precisely', () => {
    expect(subtractStock(10.5, 3.2)).toBe(7.3);
  });

  it('should not go below 0', () => {
    expect(subtractStock(2, 5)).toBe(0);
  });
});
```

---

## Fase 3: Cronograma de Implementação

| # | Tarefa | Dependências | Estimativa |
|---|--------|--------------|------------|
| 1 | Instalar big.js | Nenhuma | 2 min |
| 2 | Criar `lib/math.ts` | Tarefa 1 | 10 min |
| 3 | Atualizar `stock-deductor.ts` | Tarefa 2 | 20 min |
| 4 | Atualizar `routes/mimaki.ts` | Tarefa 2 | 10 min |
| 5 | Atualizar `routes/reports.ts` | Tarefa 2 | 15 min |
| 6 | Criar migration + schema | Tarefa 3 | 15 min |
| 7 | Escrever testes | Tarefa 2 | 20 min |
| 8 | Testar TypeScript + ESLint | Todas | 10 min |

**Total Estimado:** ~102 minutos

---

## Fase 4: Verificação

### Checklist de Validação

- [ ] **big.js instalado**: `npm list big.js` retorna versão
- [ ] **Tipos TypeScript**: `npm run typecheck` sem erros
- [ ] **ESLint**: `npm run lint` sem warnings
- [ ] **Testes unitários**: `npm run test` todos passam
- [ ] **Cálculo HP**: `3.5819 / 1.60 = 2.239` (não `2.238687...`)
- [ ] **Cálculo Mimaki**: `height * pages * units / 1000` preciso
- [ ] **Estoque não negativo**: `Math.max(0, ...)` mantido
- [ ] **Relatórios**: Soma de áreas/tintas sem erros de ponto flutuante
- [ ] **Auditoria**: Campos `rollWidthUsed` e `linearMetersDebited` armazenados (se implementado)

### Cenários de Teste

1. **HP LONA 280G 1,06m:**
   - Área: 4.9426 m²
   - Largura: 1.06 m
   - Esperado: 4.663 m lineares
   - Atual: 4.6628301886792455 (ERRO)

2. **HP LONA 440G 1,60m:**
   - Área: 3.5819 m²
   - Largura: 1.60 m
   - Esperado: 2.239 m lineares
   - Atual: 2.2386875000000003 (ERRO)

3. **Mimaki (height=1600mm, pages=1, units=1):**
   - Cálculo: 1600 × 1 × 1 / 1000 = 1.6 m
   - big.js: 1.600 (com 3 casas decimais)
   - Nota: Largura da bobina (0,75m) já está implícita no height_mm

4. **Mimaki (height=750mm, pages=2, units=1):**
   - Cálculo: 750 × 2 × 1 / 1000 = 1.5 m
   - big.js: 1.500 (com 3 casas decimais)

---

## Arquivos a Criar/Modificar

### Criar
| Arquivo | Descrição |
|---------|-----------|
| `grafica-app/backend/src/lib/math.ts` | Utilidades de precisão decimal |
| `grafica-app/backend/src/lib/__tests__/math.test.ts` | Testes unitários |
| `grafica-app/backend/drizzle/0008_add_audit_fields.sql` | Migration para campos de auditoria |

### Modificar
| Arquivo | Mudanças |
|---------|----------|
| `grafica-app/backend/package.json` | Adicionar `big.js` + `@types/big.js` |
| `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts` | Usar big.js para divisão e subtração |
| `grafica-app/backend/src/routes/mimaki.ts` | Usar big.js para cálculo de lengthMeters |
| `grafica-app/backend/src/routes/reports.ts` | Usar big.js para soma de valores |
| `grafica-app/backend/src/db/schema.ts` | Adicionar `rollWidthUsed` e `linearMetersDebited` |

---

## Referências

- [big.js Documentation](https://github.com/MikeMcl/big.js/)
- [IEEE 754 Floating Point Issues](https://0.30000000000000004.com/)
- [Projeto Atual: PLAN-hp-substrate-deduction.md] (se existir)
- [Exemplo do Usuário]: `FOSCA 0,48 + |0,04 DEFEITO| + 1,08 Mts. = 1,60 Mts.`

---

## Nota Importante: Bobinas Mimaki

**Larguras Padrão:**
| Material | Largura | Observação |
|----------|---------|------------|
| Materiais comuns | 0,75m (75cm) | Padrão para maioria dos substratos |
| Materiais específicos | 0,60m (60cm) | Para materiais especiais |

**Fluxo de Cálculo:**
```
Tracker Mimaki → Envia: height_mm, pages, quantity_units
    ↓
Cálculo: lengthMeters = (height_mm × pages × units) / 1000
    ↓
Exemplo: (1600mm × 1 × 1) / 1000 = 1.600m
    ↓
Débito: 1.600m do estoque (unidade: metros)
```

**Por que não precisa de largura no cálculo?**
- O `height_mm` já é o comprimento linear consumido do rolo
- A largura da bobina (0,75m) já está implícita na medição do printer
- O cálculo é: `comprimento_linear = altura_impressão` (não envolve área)
