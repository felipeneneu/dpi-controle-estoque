# Plan: HP Substrate Usage Fix — Unidade de Medida + Sleep/Wake

## Overview

O HP Latex 330 reporta substrate usage em **m²**, mas o estoque é rastreado em **metros lineares**. O `stock-deductor.ts:85` subtrai `mediaAreaM2` (m²) diretamente de `currentQuantity` (m), causando super-débito. Além disso, quando a impressora entra em sleep, o agente recebe HTML em vez de XLS e gera erros em loop.

**Prioridade:** Finding A (bug de unidade) é o MAIOR BUG — corrige estoque real. Finding B (sleep/wake) é o segundo. Finding C (validação) é verificação.

## Phase 0 — Decisions

| # | Decisão | Escolha | Rationale |
|---|---------|---------|-----------|
| D1 | Unidade de estoque para mídia | Manter `unit: 'm'` (metros) | Stock items já são cadastrados em metros; o bug é no código, não no dado |
| D2 | Onde converter m² → m | No `stock-deductor.ts` | Conversão fica no ponto de débito; o parser continua gravando m² puro no `printJobs.mediaAreaM2` (fonte fiel do HP) |
| D3 | Como detectar sleep | `content-type` header + body signature (`<device-info state="sleeping"`) | Dupla checagem: se HP mudar content-type mas manter body, ou vice-versa |
| D4 | Comportamento em sleep | Log informativo, NÃO incrementar `consecutiveFailures`, retry no próximo intervalo normal | Evita backoff desnecessário — impressora pode dormir por horas |
| D5 | Fator de correção / fudge | NÃO aplicar — validar primeiro (Finding C) | O HP m² pode ter bordas/margens; confirmar com medição física antes de ajustar |
| D6 | stockTransactions.quantity | Gravar metros (após conversão) para alinhar com `unit: 'm'` | Transação deve refletir o que foi debitado do estoque |
| D7 | Fonte da largura do rolo (implementado) | 1º **nome do arquivo do job** → 2º **nome do perfil HP** → 3º **`width` do item** | O arquivo impresso é quem registra o rolo REAL carregado; o perfil HP e o cadastro completam quando não houver largura no nome |

---

## Operador: convenção OBRIGATÓRIA

> Regra de ouro: **todo arquivo enviado para a HP deve começar com o nome do rolo real carregado + sua largura.**

### Nome do arquivo (regra de débito nº 1)

- **Começar sempre com `<MÍDIA> <largura>m`** — o primeiro "número + unidade" do nome é o que o sistema usa.
- ✅ Exemplos corretos:
  - `LONA 280G 1,06m - Pedido 8 - Backdrop.pdf`
  - `lona 280g 1,27m - Item 12 - #31000.pdf`
  - `LONA 440G BRILHO 1,40 Mts - Mural.pdf`
- ❌ Evitar:
  - `Pedido 8 - LONA 280G 300 x 250 cm.pdf` → largura **depois** do nome do pedido; números tipo "300 x 250" **não confundem** o sistema, mas atrasam e arriscam o primeiro match.
  - `1,6 m` solto sem o nome da mídia → o sistema aceita (`m` é unidade válida), mas sem o nome da mídia **não encontra o item de estoque** certo para debitar.

### Formato aceito para a largura

- Com vírgula ou ponto: `1,06m`, `1.27 m`, `1,60 Mts.`, `1,4 metros`.
- Em mm: `1060mm`, `1520mm` (convertido automaticamente para metros).
- Intervalo válido de bobina: **0,3 m a 3,5 m** (fora disso o sistema ignora e tenta a próxima fonte).

### Perfil HP (regra de débito nº 2)

- Mesma convenção no nome do perfil: `starflex 280g - 1,06m`, `lona 280g - 1,27m`.
- Usado quando o nome do arquivo não tiver largura.

### Cadastro de estoque (regra de debito nº 3)

- **1 item por perfil/largura**, com `width` preenchido e o nome contendo o nome do perfil.
  - Ex.: item `STARFLEX 280G 1,06 Mts.` (width `1.06`, unit `m`) ← → perfil `starflex 280g - 1,06m`.
- Quando o nome do arquivo informa a largura, o sistema escolhe o item **com essa largura exata**.
- Se faltar largura em arquivo, perfil e item → o sistema **avisa no log** e debita m² como se fossem metros (comportamento antigo, a ser evitado).

### Por que funciona

O HP `accounting.xls` reporta o **nome do arquivo de cada job** — é o mesmo nome que aparece na tabela de jobs do sistema (ex.: `30999 - Item 6 - ... - parte2.pdf`). O débito lê esse nome e converte `m² ÷ largura = metros` (a HP mede o consumo em m² = largura do rolo × comprimento avançado).

## Tech Stack

Manter stack existente: TypeScript ESM, drizzle-orm, Fastify, Turso (`@libsql/client`). Sem novas dependências.

## File Structure (mudanças)

```
grafica-app/backend/src/agents/hp-latex/
├── downloader.ts          ← ADICIONAR: detecção de sleep (content-type + body check)
├── index.ts               ← ADICIONAR: lógica de "printer asleep" no poll loop
├── stock-deductor.ts      ← CORRIGIR: conversão m² → m usando item.width
├── types.ts               ← NOVO: tipo para resultado do download (normal | sleeping | error)
├── parser.ts              ← SEM MUDANÇA (continua gravando m² puro)
├── job-detector.ts        ← SEM MUDANÇA
└── ...outros              ← SEM MUDANÇA

grafica-app/backend/scripts/
├── validate-substrate.ts  ← NOVO: script de validação (Finding C)
```

---

## Task Breakdown

### Tarefa 1 — Criar tipo `DownloadResult` estendido (Finding B) ✅ CONCLUÍDO
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** —
**File:** `grafica-app/backend/src/agents/hp-latex/downloader.ts`

> Status: implementado inline em `downloader.ts` (union `{ok:true;filePath;fileName} | {ok:false;reason:'asleep'|'unexpected';status?}`) — sem arquivo `types.ts` separado. `isSleepPage()` detecta `<device-info state="sleeping"`, "Modo de economia de energia", "Modo de inatividade" e o form `name="WakeUp"` nos primeiros 4096 bytes; content-type HTML + assinatura → `asleep`, HTML sem assinatura → `unexpected`.

**INPUT:** Interface atual `DownloadResult` (filePath, fileName).
**OUTPUT:** Novo tipo `DownloadStatus` que é union de:
```ts
type DownloadStatus =
  | { ok: true; filePath: string; fileName: string }
  | { ok: false; reason: 'asleep' }
  | { ok: false; reason: 'error'; error: Error };
```
**VERIFY:** `npx tsc --noEmit` passa no backend.

---

### Tarefa 2 — Detecção de sleep no downloader (Finding B)
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** T1
**File:** `grafica-app/backend/src/agents/hp-latex/downloader.ts`

**INPUT:** `downloadAccounting()` atual que retorna `DownloadResult`.
**OUTPUT:** `downloadAccounting()` retorna `DownloadStatus`:
1. Após `fetch`, checar `res.headers.get('content-type')`: se contiver `text/html`,ler os primeiros 4096 bytes do buffer e procurar `<device-info state="sleeping"` ou `Modo de economia de energia`.
2. Se sleep detectado → `{ ok: false, reason: 'asleep' }` (NÃO escrever arquivo temporário).
3. Se content-type é `application/vnd.ms-excel` ou `application/octet-stream` (ou qualquer coisa que NÃO seja text/html) → prosseguir como antes (gravar XLS).
4. Se `res.ok === false` → `{ ok: false, reason: 'error', error: ... }`.
5. **Manter** `cleanupFile` como está (apenas remove arquivo se existir).

**VERIFY:** `npx tsc --noEmit` passa. `downloadAccounting` retorna tipo correto.

---

### Tarefa 3 — Adaptar poll loop para sleep (Finding B)
**Agent:** backend-specialist | **Priority:** P1 | **Depends:** T2
**File:** `grafica-app/backend/src/agents/hp-latex/index.ts`

**INPUT:** `pollOnce()` atual que chama `downloadAccounting()` e `parseXls()`.
**OUTPUT:**
1. Em `pollOnce()`, usar o novo retorno de `downloadAccounting()`:
   - Se `reason === 'asleep'`: log `${TAG} Impressora em modo sleep — ignorando este ciclo`, **NÃO** incrementar `consecutiveFailures`, `return` normalmente.
   - Se `reason === 'error'`: incrementar `consecutiveFailures` como hoje.
   - Se `ok === true`: resetar `consecutiveFailures = 0` e prosseguir com parse → detect → insert → deduct.
2. Wrapping do `try/catch` do `parseXls` continua existindo — se o parser falhar (arquivo corrompido, etc.), incrementa `consecutiveFailures`.
3. Log de sleep deve ser menos verboso (a cada 10 ocorrências ou algo assim) se a impressora ficar dormindo por muito tempo.

**VERIFY:** `npx tsc --noEmit` passa. Manual: simulando sleep (mock de content-type text/html), o agente não incrementa backoff.

---

### Tarefa 4 — Corrigir conversão m² → m no stock-deductor (Finding A) ⚠️ CRÍTICO ✅ CONCLUÍDO
**Agent:** backend-specialist | **Priority:** P0 | **Depends:** —
**File:** `grafica-app/backend/src/agents/hp-latex/stock-deductor.ts`

> Status: implementado. Largura resolvida na ordem: `parseMediaWidthM(job.jobName)` → `parseMediaWidthM(job.mediaType)` → `item.width`. `findMediaItem(rows, mediaType, widthHint)` escolhe o item com `width` igual ao hint quando houver (ambigüidade 1,06 vs 1,27 resolvida). `debitQty = mediaAreaM2 / widthM`, transação grava metros, `printJobs.mediaAreaM2` mantém m² puro. Sem largura em nenhuma fonte → aviso no log + fallback m² (comportamento antigo).

**INPUT:** Linha 85: `const newQty = Math.max(0, item.currentQuantity - job.mediaAreaM2);`
**OUTPUT:**
```ts
// Converte m² do HP para metros lineares usando a largura da bobina
const rollWidth = item.width;  // ex: 1.06m
if (!rollWidth || rollWidth <= 0) {
  console.warn(`${TAG} Item ${item.name} sem width definido — pulando débito de mídia`);
  continue; // ou break, dependendo do loop
}
const linearMeters = job.mediaAreaM2 / rollWidth;
const newQty = Math.max(0, item.currentQuantity - linearMeters);
```
Também:
- **stockTransactions.quantity** (linha 94): gravar `linearMeters` (não `job.mediaAreaM2`) para que a transação reflita o que saiu do estoque em metros.
- Adicionar log: `console.log(\`${TAG} Débito mídia: ${job.mediaType} — ${job.mediaAreaM2}m² ÷ ${rollWidth}m = ${linearMeters.toFixed(3)}m de ${item.name}\`);`
- `job.mediaAreaM2` continua sendo gravado no `printJobs.mediaAreaM2` (fonte de verdade HP) — NÃO alterar.

**VERIFY:**
- `npx tsc --noEmit` passa.
- Unit test manual: se `item.width = 1.06` e `job.mediaAreaM2 = 4.9426`, então `linearMeters = 4.6638m` (≈ 4.66m). `stockTransactions.quantity` = 4.6638.
- Conferir que jobs antigos com `stockDeducted: true` NÃO são re-debitados (o `detectNewJobs` já filtra por `jobId` único).

---

### Tarefa 5 — Script de validação Finding C
**Agent:** backend-specialist | **Priority:** P2 | **Depends:** —
**File:** `grafica-app/backend/scripts/validate-substrate.ts`

**INPUT:** Jobs do DB (`print_jobs`) com `mediaType LIKE '%starflex%'` e `stockTransactions` correspondentes.
**OUTPUT:** Script que:
1. Busca todos os jobs starflex do DB (últimos 30 dias).
2. Para cada job, calcula `expectedMeters = mediaAreaM2 / 1.06` (ou `item.width`).
3. Busca a transação de estoque correspondente (`stockTransactions` com `reason` contendo o `jobName`).
4. Mostra tabela: `jobName | mediaAreaM2 | expectedMeters | actualDebited | diff`.
5. Se houver diff > 0.01m, flag `⚠️ DIVERGÊNCIA`.
6. Resumo: total m² HP vs total metros debitados vs diferença percentual.
7. **NÃO altera dados** — é read-only.

**VERIFY:** Roda sem erros, output legível. Conferir que os números batem com a correção da Tarefa 4.

---

### Tarefa 6 — Ajuste de retrocompatibilidade ( Finding A + existing jobs)
**Agent:** backend-specialist | **Priority:** P2 | **Depends:** T4
**File:** `grafica-app/backend/scripts/fix-historical-deductions.ts`

**INPUT:** Jobs antigos já debitados com `stockDeducted: true` que foram afetados pelo bug de unidade.
**OUTPUT:** Script que:
1. Identifica jobs starflex com `stockDeducted: true` e `deductedAt` anterior à correção.
2. Para cada um, calcula `erradoMetros = mediaAreaM2` (o que foi debitado) e `corretoMetros = mediaAreaM2 / width`.
3. Calcula `diferença = erradoMetros - corretoMetros` (positivo = foi super-debitado).
4. Mostra resumo (NÃO altera dados automaticamente — gera SQL de `UPDATE` para revisão manual).
5. Inclui opção `--apply` para executar (após revisão): faz `UPDATE stock_items SET current_quantity = current_quantity + diferença` e insere uma `stockTransaction` de tipo `ADJUSTMENT` com reason explicativo.

**VERIFY:** Script roda dry-run sem erros. Com `--apply`, estoque é corrigido. `npx tsc --noEmit` passa.

---

### Tarefa 7 — Testes e verificação final
**Agent:** test-engineer | **Priority:** P2 | **Depends:** T1-T6
**INPUT:** Todos os arquivos modificados.
**OUTPUT:** Verificar que tudo funciona:
- `npx tsc --noEmit` no `grafica-app/backend` — zero erros.
- `npx eslint` no backend — zero erros novos (warnings existentes ok).
- Rodar `validate-substrate.ts` e conferir output.
- Se possible, rodar agente com printer real (ou mock) e confirmar que:
  - Job é inserido com `mediaAreaM2` correto.
  - `stockTransactions.quantity` é em metros (dividido por width).
  - `currentQuantity` do item diminuiu corretamente.
  - Sleep mode não gera erros nem backoff.

**VERIFY:**
- [ ] `npx tsc --noEmit` passa
- [ ] `npx eslint` passa (ou warnings mínimos)
- [ ] `validate-substrate.ts` roda sem erros
- [ ] Débito correto: `mediaAreaM2 / width` subtraído de `currentQuantity`
- [ ] Transação reflete metros, não m²
- [ ] Sleep detection funciona (content-type text/html → skip, sem backoff)
- [ ] Jobs antigos com erro de unidade identificados

---

## Phase X — Verification Checklist

### Build
- [ ] `npx tsc --noEmit` — zero errors no `grafica-app/backend`
- [ ] `npx eslint src/agents/hp-latex/**` — zero errors

### Manual Tests
- [ ] Curl HP accounting (impressora online) → XLS retornado corretamente
- [ ] Curl HP accounting (impressora sleep) → content-type text/html detectado, agente loga "sleep" e não falha
- [ ] Rodar `validate-substrate.ts` → output mostra divergências (se houver)
- [ ] Rodar `fix-historical-deductions.ts` (dry-run) → mostra ajustes necessários

### DB Checks
```sql
-- Verificar que débitos recentes usam metros (não m²)
SELECT pj.job_name, pj.media_area_m2, st.quantity, st.reason
FROM stock_transactions st
JOIN print_jobs pj ON st.reason LIKE '%' || pj.job_name || '%'
WHERE st.reason LIKE 'HP Agent%'
ORDER BY st.created_at DESC LIMIT 10;
-- quantity deve ser < media_area_m2 (porque media_area_m2 / 1.06 = meters)

-- Verificar estoque atual vs esperado
SELECT name, current_quantity, unit, width
FROM stock_items
WHERE category = 'PAPER_MEDIA';
```

### Regressão
- [ ] Jobs antigos com `stockDeducted = true` NÃO são re-debitados
- [ ] `mediaAreaM2` no `print_jobs` continua sendo m² (não alterado)
- [ ] Relatório de consumo (`/api/reports/consumption`) continua retornando m² (correto para UI)
- [ ] WhatsApp alertas de estoque continuam funcionando

---

## Open Questions

1. **Largura exata da bobina:** O seed diz `1.06m`, mas o real pode ser `1.057m`. Qual valor medido na bobina física? (Afeta precisão da conversão.)
2. **Correction factor:** Após validação (Finding C), se HP m² não bater exatamente com `rollWidth × feedLength`, queremos aplicar fator de correção ou aceitar a diferença como margem/improvements do HP?
3. **Retroactive fix:** O script `fix-historical-deductions.ts` gera SQL para revisão. Quer que ele rode automaticamente ou precisa de aprovação manual antes de `--apply`?
4. **Multi-media:** No futuro, pode haver outras mídias com larguras diferentes? O código atual assume `item.width` existe — mas e se for `null`? (Já tratamos com guard, mas queremos fallback?) → **RESOLVIDO:** fallback por nome do arquivo do job e por nome do perfil HP; se nada tiver largura, avisa no log e debita m² direto.
5. **Convenção do operador:** nome do arquivo → perfil HP → cadastro. Ver seção "Operador: convenção OBRIGATÓRIA" acima. Falta um lembrete visual no painel de jobs? (opcional)

---

## Summary

| Phase | O que | Arquivos | Prioridade |
|-------|-------|----------|------------|
| **P0** | Conversão m² → m no stock-deductor | `stock-deductor.ts` | ⚠️ CRÍTICO |
| **P1** | Detecção de sleep + poll loop adaptado | `downloader.ts`, `types.ts`, `index.ts` | ALTA |
| **P2** | Validação Finding C + retroactive fix + testes | `validate-substrate.ts`, `fix-historical-deductions.ts` | MÉDIA |
