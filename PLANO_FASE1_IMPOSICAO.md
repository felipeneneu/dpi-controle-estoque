# Plano de Implementação — Imposição de Arte em Chapa 70x100 (Fase 1)

> **Escopo**: fluxo de imposição nativo/headless (CLI C# + API Fastify + Electron runner),
> independente do Illustrator/CorelDraw. Suporta chapa 70x100 (700x1000mm) com 4 margens.
> Documentos normativos: ADR-017 (headless CLI), ADR-018 (motor gráfico), GOV-004 (isolamento).

---

## Estado atual do repositório

- Branch: `feature/sidecar-impositor-konica`
- Commit de trabalho: `9ed76bd` (CLI `AutoImposerCLI`) — **completo e testado**.
- Working tree: `grafica-app/backend/src/db/schema.ts` modificado (`imposition_jobs` **já adicionado**, +40 linhas).

### O que JÁ ESTÁ funcionando (validado)

**CLI headless `sidecars/AutoImposerCLI/Program.cs` (311 linhas):**
- 4 margens independentes: `--margin-t/r/b/l` (mm, default 10)
- Rotação: `--rotation auto|0|90` (auto escolhe o cenário de maior aproveitamento)
- `--json` → imprime `RESULT_JSON:{...}` com `inputFile, sheet, art, grid, totalCopias, outputPath, outputFile, checksum (SHA256), durationMs, error`
- Exit codes: `0` sucesso | `1` erro de args/entrada | `2` erro de engine (AD-015)
- Publicação: `AutoImposerCLI.csproj` (net8.0, PdfSharp 6.1.1, self-contained win-x64)
- `.bat` raiz: `Impor_70x100.bat` com guia `Impor_70x100_GUIA.txt` — validado.

### Tabela adicionada (commit pendente)

`grafica-app/backend/src/db/schema.ts` linha 357 — `imposition_jobs`:
```ts
export const impositionJobs = sqliteTable(
  'imposition_jobs',
  {
    id: text('id').primaryKey(),
    jobName: text('job_name').notNull(),
    inputPdf: text('input_pdf').notNull(),
    sheetWMm: real('sheet_w_mm').notNull().default(700),
    sheetHMm: real('sheet_h_mm').notNull().default(1000),
    gapMm: real('gap_mm').notNull().default(2),
    marginTopMm: real('margin_top_mm').default(10),
    marginRightMm: real('margin_right_mm').default(10),
    marginBottomMm: real('margin_bottom_mm').default(10),
    marginLeftMm: real('margin_left_mm').default(10),
    rotationDeg: integer('rotation_deg').default(0),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed', 'cancelled'] })
      .notNull()
      .default('queued'),
    outputPath: text('output_path'),
    outputBytes: integer('output_bytes'),
    outputUnits: integer('output_units'),
    checksum: text('checksum'),
    durationMs: integer('duration_ms'),
    machineId: text('machine_id').references(() => machines.id),
    createdBy: text('created_by').references(() => users.id),
    presetName: text('preset_name'),
    iccProfile: text('icc_profile'),
    createdViaM2m: integer('created_via_m2m', { mode: 'boolean' }).default(false),
    error: text('error'),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    finishedAt: integer('finished_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (t) => [index('imposition_jobs_status_idx').on(t.status)],
);
```

---

## Tarefas pendentes (continuar em outro PC)

### Tarefa 2 — Migração da tabela (commit imediato)
- `git add grafica-app/backend/src/db/schema.ts && git commit -m "feat(db): tabela imposition_jobs (Fase 1, ADR-017)"`
- **Boot seguro** no `grafica-app/backend/src/server.ts` (mesmo padrão `ensureMachineTelemetryTable()` linha 22):
  `CREATE TABLE IF NOT EXISTS imposition_jobs (...)` pro SQLite Linux/dev não depender do Drizzle-migrate.
- Índice: `CREATE INDEX IF NOT EXISTS imposition_jobs_status_idx ON imposition_jobs (status)`.

### Tarefa 3 — Rotas `/api/v1/automation/jobs`
Novo arquivo `grafica-app/backend/src/routes/automation.ts` (padrão do `mimaki-test.ts`):
- `POST /api/v1/automation/jobs` — criar job (`authenticate`; zod; gera `id` via nanoid; `status: queued`)
- `GET  /api/v1/automation/jobs` — listar paginado (`page`, `pageSize`, `status`, `q`)
- `GET  /api/v1/automation/jobs/:id` — detalhe
- `PATCH /api/v1/automation/jobs/:id/result` — atualiza status/resultado (transições validadas: `queued→running→done|failed`); autenticável via m2m pra runner.
- Registrar em `app.ts`: import + `await app.register(automationRoutes)`.

### Tarefa 4 — Runner no Electron main
Criar runner (reusar `resolveImposerExecutable`):
- Recebe payload via IPC; resolve exe; monta args com 4 margens; `spawn`.
- Parser da linha `RESULT_JSON:` → objeto estruturado.
- `PATCH /api/v1/automation/jobs/:id/result` com token m2m pra atualizar status na tabela.

### Tarefa 5 — Frontend React (draft inicial em src/components/imposition/)
- `NewImpositionModal` (draft já esboçado): abas *Digital / Chapas / Bobinas / Recentes*,
  presets de impressão, 4 margens linkadas, gap, orientação (Em pé/Deitado), RGB↔CMYK, perfil ICC, RIP.
- Página `/automation`: lista de jobs com status + modal novo fluxo conectado à API.
- Conectar modal → `POST /api/v1/automation/jobs` → runner (progresso) → `PATCH result` → refresh.

### Tarefa 6 — Testes & Verificação
- Backend: `npm test` em `grafica-app/backend` passa (sem quebrar).
- Unit: parser de `RESULT_JSON` + args builder (4 margens / rotation).
- E2E manual: criar job via UI → CLI roda → job `done` com checksum; linha visível na tabela.

---

## Decisões já tomadas (não redecidir)
- **Nada de Illustrator/CorelDraw automático** até licenciamento (ADR-018, GOV-004).
- **Motor PdfSharp** (não PDFium) — imposição é composição gráfica, não rasterização.
- CLI **headless aditivo**: não quebra o `.bat` existente (args posicionais preservados).
- Margens **independentes** (T/R/B/L) — gap único por quilo de simplicidade.
- Rotação: `auto` decide por **aproveitamento** (`total90 > total0`), `0|90` força.
