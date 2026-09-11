# Plano: Selecionar Mídia Manual + Status AccurioPrint

## Objetivo
Permitir correção manual de mídia em jobs (HP e Konica) e corrigir status "indisponível" da AccurioPrint em low power mode.

---

## Problemas Identificados

| # | Problema | Causa |
|---|---------|-------|
| 1 | Mídia errada no job | Parser Konica usa mapa limitado (4 valores), job name pode não ter keyword |
| 2 | Sem UI para editar mídia | Tabela de jobs é read-only, sem endpoint PATCH |
| 3 | Status "indisponível" | Low power mode retorna `{code: "..."}` sem `message`, fallback é "Status indisponível" |
| 4 | Status vermelho incorreto | `statusSeverity = 'major'` quando `statusCount > 0`, mesmo para low power |

---

## Tarefas

### 1. Endpoint PATCH para atualizar job
**Solução:** Criar `PATCH /api/jobs/:id` para permitir atualizar campos como `mediaType`.

**Arquivo:** `grafica-app/backend/src/routes/jobs.ts`

---

### 2. UI de edição de mídia na tabela de jobs
**Solução:** Adicionar botão de editar na coluna "Material" da tabela de jobs. Ao clicar, abrir dialog com:
- Campo de texto para mídia (ex: "Couché 150g")
- Lista de materiais cadastrados no estoque para seleção rápida
- Botão Salvar

**Arquivos:**
- `grafica-app/src/components/machine-jobs-table.tsx` — botão de editar
- `grafica-app/src/components/media-edit-dialog.tsx` — novo componente

---

### 3. Detectar low power mode no Konica
**Solução:** Verificar se `printerStatus` contém indicadores de sleep/low power (ex: "Sleep", "Low Power", "Energy Save"). Se detectado:
- `statusSeverity` = `'info'` (não `'major'`)
- `statusMessage` = "Modo de economia de energia" (não "indisponível")
- `online` = `true` (dispositivo responde)

**Arquivo:** `grafica-app/backend/src/agents/konica/device-info.ts`

---

### 4. Atualizar UI para显示 status corretamente
**Solução:** Adicionar estilo para `severity === 'info'` (azul/cinza) em vez de vermelho.

**Arquivo:** `grafica-app/src/components/konica-telemetry-panel.tsx`

---

## Concluído quando
- [ ] Botão de editar mídia aparece na tabela de jobs
- [ ] Dialog permite selecionar/editar mídia
- [ ] Mídia é salva no banco via PATCH
- [ ] Status low power mostra "Modo de economia de energia" (não "indisponível")
- [ ] Status low power não aparece em vermelho
