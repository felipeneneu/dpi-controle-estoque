# PLAN — Marcas de Imposição (inspirado no Kodak Preps 9)

> **Estado:** PLANNING ONLY — nenhum código implementado; este arquivo é o plano de implementação.
> **Objetivo:** re-implementar o sistema de marcas de imposição do Kodak Preps 9 (Marks estáticas + SmartMarks) no impositor headless C#/.NET com motor PdfSharp 6.1.1, no domínio e nas regras deste repo.
> **Tipo de projeto:** BACKEND (core + sidecar CLI .NET) com extensão WEB (API Fastify + UI React/Electron). Agente primário: `backend-specialist`.
> **Documentos normativos:** `packages/imposition-core/AGENTS.md` (Regras 1–8), `docs/engineering/IMPOSICAO-MOTOR.md` (contrato vivo), `PLANO_FASE1_IMPOSICAO.md`, ADR-015, ADR-017, ADR-021, ADR-023, ADR-024, `docs/engineering/TESTING_STRATEGY.md`, `docs/governance/DOC_POLICIES.md`.

---

## 1. Visão geral

O impositor headless atual (Motor 1 — `AutoImposerCLI`) gera a chapa com as artes posicionadas pela `GridSearchEngine`, mas **não desenha nenhuma marca de imposição** no PDF final. O Kodak Preps 9 instalado localmente possui um ecossistema maduro de marcas:

- **Marks estáticas** — ~40 arquivos EPS/PDF PostScript (registro, cruzetas, color bars, código de barras, guias…);
- **SmartMarks (.smk)** — ~60 arquivos de texto proprietário em 5 grupos (Gutters, Outside Imposition, Page Trimboxes, Sample Group, Tutorial), com modelo de posicionamento por *entidades de referência + âncoras numeradas + dupflags por assinatura*.

Este plano reconstrói esse sistema no nosso domínio, em C# tipado e JSON próprio, com saída **na própria chapa** e/ou **overlay PDF separado** (plotter de corte), respeitando as regras do repo (precisão com tolerância explícita, contagem verificada, contrato exige ADR).

**Escopo V1 (decidido no gate socrático):** crop marks (corte/retícula), registro externo (4 cantos da folha), color bar CMYK/spot, slugline/etiqueta do job.
**Fora do V1 (P1/P2):** dobra, código de barras, micro-dot, guias laterais, colação, importador .smk.

---

## 2. Análise do que foi investigado

### 2.1 Marcas estáticas do Preps (`C:\Program Files (x86)\Kodak\Preps 9\Marks`)

~40 arquivos EPS/PDF PostScript:

| Família | Arquivos | Características |
|---|---|---|
| Registro | `regmark1/2.eps|pdf` | cruz + círculo de registro |
| Cruzetas/círculos | `onlycros`, `opencros`, `fillcros`, `onlycirc`, `opencirc`, `fillcirc` | abertos/fechados |
| ID CMYK | `cmykid.eps|pdf` | quadrado C M Y K em 4 quadrantes |
| Micro-dots | `REG_Micro Dot.pdf`, `REG_Micro Dot_Double.pdf` | (P1) |
| Color bars | `Dupmarks/` — `colorbar`, `digital4colorbar`, `digital6colorbar`, `k+5spotcolorbar` | eps+pdf |
| Códigos de barras | `MM-bar128c.eps` (Code128C, tabela 105 no EPS), `WST-bar2of5...`, `WebSyncCCR34/50` | (P1/P2) |
| Guias/colação/dispositivo | `SideGuideLong/Short`, `sigcolla-e` (ABC/JA/zh), `Device-Resolution-Text`, `Digital-Exposure-Test` | (P1/P2) |

Formato: headers `PS-Adobe-2.0 EPSF-1.2` com `%%BoundingBox` (ex: 18×18pt), PostScript puro (`setcmykcolor`, `moveto/lineto/stroke`, `arc/fill`), alguns com `%%DocumentProcessColors` e `%%BeginProcessColor/%%EndProcessColor`, sufixo `%SSiNoCaching`, thumbnail JPEG binária após o EPS.

### 2.2 SmartMarks (.smk)

~60 arquivos em 5 grupos (`Gutters/`, `Outside Imposition/`, `Page Trimboxes/`, `Sample Group/`, `Tutorial/`), cada grupo com `INFO.SMG`. Formato `linha: valor` entre `%SSiSmartMarkStart:` / `%SSiSmartMarkEnd:`.

Campos-chave do formato:

| Campo | Significado |
|---|---|
| `name`, `text` | nome; `text` vazio = marca geométrica gerada pelo Preps; preenchido = referencia EPS/PDF |
| `dupflags`, `sigstart`, `sigmod` | replicação por assinatura (ex: 35, 1059) |
| `colortype`, `color1..4` | tinta CMYK em % (0–100) |
| `rotation`, `section` | rotação em graus; seção |
| `smartoffsetx/y` | deslocamento relativo à âncora (pt) |
| `refentity`, `refanchor`, `markanchor` | entidade de referência e âncoras numeradas no modelo Preps |
| `refentityb`, `refanchorb`, `smartoffsetb` | **modo esticado entre 2 referências** (ex: `Gutters_Center.smk`, `ColorBar.smk` com `calibratedupmark`) |
| `width/height`, `outsideonly`, `overlap`, `linestyle` | geometria/posição (linha tracejada/cheia) |
| `origingroup` | grupo de origem |

Exemplos lidos na íntegra: `Cropmarks.smk` (offset 9/18 pt; `outsideonly: true`; refentity 2/refanchor 7/markanchor 7), `ColorBar.smk` (2 referências, altura esticada à folha), `PressSheet_Bottom.smk` (linha na borda da folha).

### 2.3 Estado atual do nosso motor

- `sidecars/AutoImposerCLI/Program.cs`: chapa 700×1000mm default, grade centralizada (`startX/startY` = margin + (util-grade)/2), `XGraphics.DrawImage(arteForm, xPt, yPt, wPt, hPt)` (seções 265–288), rotação 90 via `TranslateTransform+RotateTransform`, `RESULT_JSON` com checksum SHA256 e `plannedUnits/drawnUnits/readBackUnits` (ADR-023 / BR-010).
- `PdfReadBack.CountDrawnUnits` conta operadores `Do` no content stream. **Risco:** marcas desenhadas via XForm também emitem `Do` e podem poluir a contagem de peças — tratado na T2.2.
- Core puro (`packages/imposition-core`) sem IO e sem PackageReference (Regra 8); contrato `ImpositionInput`; mudança de contrato exige ADR (Regra 6).
- Golden-master (Regra 2): 19×34mm em 665×986mm → 1015 peças (`cols=35, rows=29, orientation=0`).

---

## 3. Decisões do usuário (gate socrático — NÃO redecidir)

1. **V1:** crop marks, registro externo, color bar CMYK/spot, slugline. (Sem dobra, código de barras nem micro-dot em V1 — P1/P2.)
2. **Formato:** reutilizar os EPS/PDF originais do Preps como formas embutidas — **condicionado** ao veredito do spike T0.3 (PdfSharp 6.1.1 embute XForm de PDF externo?). Plano B definido: gerar marcas nativamente em C# replicando a geometria EPS simples, ou merge pós-processamento.
3. **Saída:** ambos — flag no job: marcas no mesmo PDF da chapa E/OU overlay PDF separado (máquina de corte).
4. **Modelo:** modelo Preps completo (refentity + refanchor numerados + dupflags por assinatura) tipado em C#, serializado em **JSON próprio** (NÃO .smk; importador .smk é P2 opcional).

---

## 4. Critérios de sucesso (mensuráveis)

- **Neutralidade:** sem config de marcas, o comportamento é idêntico ao atual (golden-master Regra 2 passa em CI).
- **Precisão:** com marcas, posições exatas previstas pelo resolvedor de âncoras ±0,1mm (tolerância explícita, Regra 1 — sem epsilon mágico).
- **Overlay:** segundo PDF na mesma mídia contendo **apenas** marcas, parseável/contável por leitura automática.
- **Contabilidade:** `RESULT_JSON` declara marcas (`marksCount`, `marksReadBack`, `marksOverlayFile`, `schemaVersion` atualizado) sem quebrar leitores antigos; contagem de peças (BR-010/ADR-023) permanece intacta com marcas ligadas.
- **Testes:** suíte BR-030* (âncoras), BR-031* (duplication), BR-032* (serialização/JSON) verdes; golden-master cross-motor inalterado.
- **Governança:** ADR-040 aprovado, `IMPOSICAO-MOTOR.md` (contrato vivo) atualizado, `docs:check` verde.

---

## 5. Stack

| Camada | Tecnologia | Justificativa |
|---|---|---|
| Core | .NET 8 (`net8.0`; `net10` conforme ADR-024) — `packages/imposition-core` | fonte única de verdade (ADR-021); sem IO, sem PackageReference |
| Motor de render | PdfSharp 6.1.1 — `sidecars/AutoImposerCLI` | composição gráfica vetorial (ADR-017/018) |
| Serialização | System.Text.Json | contrato JSON versionado (ADR-021 §2, ADR-023) |
| Testes | xUnit, convenção BR-* (`TESTING_STRATEGY.md`) | testes de contrato cross-motor |
| API/UI | Fastify + Drizzle/sqlite + React/Electron (`grafica-app`) | mesmo padrão das Tarefas 2–5 do `PLANO_FASE1_IMPOSICAO.md` |
---

## 6. Estrutura de arquivos (alvo)

```
docs/
  PLAN-marcas-imposicao.md                      <- este plano
  engineering/MARCAS_PREPS_INVENTARIO.md        <- T0.1 (catálogo)
  engineering/IMPOSICAO-MOTOR.md                <- atualizado (nova seção "Marcas")
  governance/adr/ADR-040-marcas-imposicao.md    <- T1.1 (+ ADR_INDEX.md)

packages/imposition-core/                        (sem IO, sem PackageReference — Regra 8)
  src/Imposition.Core/
    Contracts/Marks/
      MarksSpec.cs            (config do job; SchemaVersion "1.1")
      MarksGroup.cs           (equivalente ao INFO.SMG)
      MarkDefinition.cs       (marca individual + refs/âncoras/offsets)
      RefEntity.cs            (enum: Folha, Peça, Grade, Assinatura, Grupo)
      RefAnchor.cs            (âncoras numeradas: Folha 9 pontos; Peça 4 cantos + centro)
      MarkAnchor.cs           (âncora da própria marca)
      DuplicationFlags.cs     (dupflags / sigstart / sigmod)
      LineStyle.cs, CmykColor.cs
    Marks/
      AnchorResolver.cs       (posiciona: 1 referência OU esticada entre 2 referências)
      DuplicationPlanner.cs   (dupflags -> posições replicadas por assinatura)
  tests/Imposition.Core.Tests/Marks/
    AnchorResolverTests.cs / DuplicationPlannerTests.cs / MarksSpecJsonTests.cs

sidecars/AutoImposerCLI/
  Marks/
    MarksRenderer.cs          (orquestra desenho pós-artes, pré-save)
    CropMarkRenderer.cs / RegistrationMarkRenderer.cs / ColorBarRenderer.cs / SlugLineRenderer.cs
    PdfFormMarkBridge.cs      (XForm de PDF/EPS externo — condicionado a T0.3)
    MarksReadBack.cs          (contagem/leitura de marcas no PDF, separada de peças)
  Imposition/PdfReadBack.cs   (atualizado: classifica/ignora Do de marcas)
  spec/marks-default.json     (defaults camada 4 — EffectiveInputResolver)
  OverlayExporter.cs          (T3.1 — PDF overlay só com marcas)

grafica-app/
  backend/src/db/schema.ts                     (imposition_jobs + marks_config_json + overlay)
  backend/src/routes/automation.ts             (zod: marksConfig, overlay)
  backend/src/server.ts                        (boot seguro das colunas)
electron/services/imposition-orchestrator.js   (spawn com --marks-*)
grafica-app/src/components/imposition/         (NewImpositionModal — seção Marcas)
```

---

## 7. Fases e tarefas

### FASE 0 — Análise & importação

#### T0.1 — Inventário formal das marcas do Preps
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** —
- **Arquivos/pacotes afetados:** novo `docs/engineering/MARCAS_PREPS_INVENTARIO.md`; leitura de `C:\Program Files (x86)\Kodak\Preps 9\Marks` e `.\SmartMarks\*` (5 grupos com INFO.SMG)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: pastas Marks + SmartMarks
  - OUTPUT: catálogo por grupo: nome, tipo (EPS/PDF/SMK), bbox (`%%BoundingBox`), processo de cor (`%%DocumentProcessColors`), flags relevantes (dupflags, refentity/refanchor, outsideonly, linestyle), e mapa "qual SMK referencia qual EPS/PDF"
  - VERIFY: `docs:check` verde; catálogo com ≥5 grupos e contagem de assets conferida com a instalação local; SMKs dos grupos V1 (Cropmarks, ColorBar, registro, PressSheet_Bottom) presentes no catálogo
- **Rollback:** arquivo documental — remover sem impacto em código.

#### T0.2 — Política de licenciamento/ingestão (decisão para ADR-040)
- **Agente:** documentação (+ security-auditor para revisão)
- **Prioridade:** P0
- **Depende de:** T0.1
- **Arquivos/pacotes afetados:** este plano (§10) e, depois, `ADR-040`; nenhum asset binário do Kodak
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: inventário T0.1 + termos/EULA da instalação comercial do Kodak (consulta ao usuário)
  - OUTPUT: recomendação explícita entre: (a) ingestão por subprocesso a partir da instalação local (jamais commitar binários no repo), (b) marcas 100% nativas geradas por nós, (c) híbrido (nativas para V1; ingestão local opcional para compat visual). Nota de licenciamento registrada.
  - VERIFY: seção "Licenciamento" com recomendação única e prós/contras; nenhum `.eps/.pdf` do Preps commitado
- **Rollback:** documental.

#### T0.3 — Spike: PdfSharp 6.1.1 embute PDF existente como XForm?
- **Agente:** backend-specialist
- **Prioridade:** P0 — é o gate da decisão 2 do usuário
- **Depende de:** T0.1 (escolher o PDF do spike: `regmark1.pdf`)
- **Arquivos/pacotes afetados:** projeto de spike fora do fluxo produtivo (não commitar como feature); relatório anexado a este plano ou em `docs/engineering/`
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: 1 PDF de marca do Preps + API PdfSharp 6.1.1 (`XPdfForm`/`XForm`/import)
  - OUTPUT: veredito técnico: (i) XForm externo suportado → caminho A (reuso de assets); (ii) não suportado/instável → plano B (geometria nativa em C# — EPS V1 são PostScript simples) ou merge pós-processamento
  - VERIFY: documento com build/exit-code reproduzível + 1 chapa de teste com marca importada (caminho A) OU justificativa técnica do plano B com amostras da geometria EPS
- **Rollback:** spike isolado; nada no fluxo produtivo.

---

### FASE 1 — Contrato / core

#### T1.1 — ADR-040: Marcas de imposição (Regra 6 do AGENTS.md)
- **Agente:** documentação
- **Prioridade:** P0
- **Depende de:** T0.2, T0.3
- **Arquivos/pacotes afetados:** novo `docs/governance/adr/ADR-040-marcas-imposicao.md`; `docs/governance/ADR_INDEX.md`
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: decisões do usuário (§3) + vereditos T0.2/T0.3 + regras do pacote
  - OUTPUT: ADR formal: contrato `MarksSpec`, modelo de âncoras, saída overlay, política de licenciamento, `schemaVersion` "1.1", gatilhos de reavaliação
  - VERIFY: segue `ADR_TEMPLATE.md`; `ADR_INDEX.md` atualizado; `docs:check` verde
- **Rollback:** documental.

#### T1.2 — Contrato `MarksSpec` no imposition-core (sem IO)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T1.1
- **Arquivos/pacotes afetados:** `packages/imposition-core/src/Imposition.Core/Contracts/Marks/*.cs`; possível bump de `SchemaVersion` no `ImpositionInput.cs` (decisão do ADR-040)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: ADR-040 + decisões V1
  - OUTPUT: records tipados — `MarksSpec`, `MarksGroup`, `MarkDefinition`, enums `RefEntity`/`RefAnchor`/`MarkAnchor`, `DuplicationFlags`, `LineStyle`, `CmykColor` (%); offsets em **mm**, rotação em graus, `OutsideOnly`, `Overlap`; sem IO e sem PackageReference novos
  - VERIFY: `dotnet build` do core limpo; teste de round-trip JSON com schema versionado; grep confirma ausência de `using System.IO` e nenhum PackageReference novo
- **Rollback:** revert do commit; contrato anterior intocado.

#### T1.3 — `AnchorResolver` puro (1 referência e esticada entre 2 referências)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T1.2
- **Arquivos/pacotes afetados:** novo `packages/imposition-core/src/Imposition.Core/Marks/AnchorResolver.cs`; testes `tests/Imposition.Core.Tests/Marks/AnchorResolverTests.cs`
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: folha 700×1000mm default com 9 âncoras (4 cantos + 4 meios de borda + centro); peça com âncoras de canto/centro no espaço NÃO rotacionado; offsets em mm
  - OUTPUT: função pura que devolve (X, Y em mm): (a) âncora única + offset; (b) esticada entre 2 referências (estilo `ColorBar.smk` / `refentityb`)
  - VERIFY: unit — registro nos 4 cantos; crop por peça com rotação 90 (âncora resolvida pré-rotação); colorbar esticada entre bordas laterais com altura da folha; slugline na borda inferior; tudo ±0,1mm
- **Rollback:** revert.

#### T1.4 — `DuplicationPlanner` (dupflags / sigstart / sigmod)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T1.2
- **Arquivos/pacotes afetados:** novo `packages/imposition-core/src/Imposition.Core/Marks/DuplicationPlanner.cs`; testes
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: `dupflags` reais (ex: 35, 1059), `sigstart`, `sigmod`, contagem de assinaturas/peças do `ImpositionResult`
  - OUTPUT: lista de posições/instâncias onde a marca replica por assinatura
  - VERIFY: unit com flags do Preps → posições esperadas documentadas; função pura (sem estado)
- **Rollback:** revert.

#### T1.5 — Defaults de marcas no `EffectiveInputResolver` (camada 4)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T1.2
- **Arquivos/pacotes afetados:** `packages/imposition-core/src/Imposition.Core/Contracts/EffectiveInputResolver.cs`; testes de precedência
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: `MarksSpec` vazio/parcial
  - OUTPUT: `MarksSpec` resolvido com defaults documentados (ex: crop offset 9/18pt → 3,175/6,35mm, `outsideonly: true`, registro sempre K100)
  - VERIFY: teste de precedência (camada 1 > 2 > 3 > 4, ADR-021 §4) passa com o novo campo
- **Rollback:** revert.

---

### FASE 2 — Motor de render C# (PdfSharp)

#### T2.1 — Renderizadores geométricos V1 (crop / registro / colorbar / slugline)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T0.3, T1.3, T1.4
- **Arquivos/pacotes afetados:** `sidecars/AutoImposerCLI/Marks/{MarksRenderer,CropMarkRenderer,RegistrationMarkRenderer,ColorBarRenderer,SlugLineRenderer}.cs`; `PdfFormMarkBridge.cs` se T0.3 = caminho A
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: `MarksSpec` resolvido + posições do `AnchorResolver` + `XGraphics` da página
  - OUTPUT: 4 renderizadores — crop (linhas fora da peça, `outsideonly`), registro (cruz + círculo nos cantos da folha), color bar (patches CMYK/spot em %, opcional esticada), slugline (texto variável do job)
  - VERIFY: chapa de teste com marcas nas coordenadas esperadas; comparação visual 1:1 contra Preps (caminho A) ou contra espec (caminho B); conversão mm→pt com fator 72/25,4 ±0,1mm
- **Rollback:** revert; marca é aditiva ao PDF.

#### T2.2 — Integração no fluxo da chapa + separação de contagem (ADR-023)
- **Agente:** backend-specialist
- **Prioridade:** P0
- **Depende de:** T2.1
- **Arquivos/pacotes afetados:** `sidecars/AutoImposerCLI/Program.cs` (pós-artes, pré-save — seções 265–316); `Imposition/PdfReadBack.cs`; novo `Marks/MarksReadBack.cs`
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: fluxo atual + marcas resolvidas
  - OUTPUT: marcas desenhadas após as artes e antes do save; `RESULT_JSON` com `marksCount`, `marksReadBack`, `marksOverlayFile` e `schemaVersion` atualizado; contagem de peças (`drawnUnits`/`readBackUnits`) permanece **só peças** — `Do` de marcas classificados/ignorados no read-back (ex: prefixo de XObject)
  - VERIFY: BR-010 verde com marcas ligadas; `marksCount` == marcas desenhadas; modo `--strict` não quebra sem divergência real
- **Rollback:** flag `--marks` default off — revert do off anterior.
#### T2.3 — (Condicional) Bridge XForm de assets reais do Preps
- **Agente:** backend-specialist
- **Prioridade:** P1
- **Depende de:** T0.3 (somente se caminho A)
- **Arquivos/pacotes afetados:** novo `sidecars/AutoImposerCLI/Marks/PdfFormMarkBridge.cs`; `spec/groups/` (referências aos assets)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: PDF/EPS de marca (regmark, fillcirc etc.) + caminho de ingestão aprovado em T0.2
  - OUTPUT: bridge que carrega o asset e desenha como forma posicionada pela âncora
  - VERIFY: comparação 1:1 com o Preps (overlay alinhado); se inviável, plano B (nativa) é o único caminho — registrado no ADR-040
- **Rollback:** desligar bridge (flag).

---

### FASE 3 — Overlay PDF

#### T3.1 — Overlay PDF separado (plotter de corte)
- **Agente:** backend-specialist
- **Prioridade:** P1
- **Depende de:** T2.2
- **Arquivos/pacotes afetados:** novo `sidecars/AutoImposerCLI/OverlayExporter.cs`; `Program.cs` (flag `--marks-overlay`)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: mesma mídia/dimensões da chapa + somente marcas
  - OUTPUT: segundo PDF (naming conforme guardrail ADR-021 §7: `_MARKS_OVERLAY.pdf`), cores DeviceCMYK compactas, sem artes
  - VERIFY: `MarksReadBack` no overlay conta exatamente as marcas previstas; dimensões idênticas à chapa; abre em viewer
- **Rollback:** não gerar arquivo → flag off.

---

### FASE 4 — CLI / API / UI

#### T4.1 — Flags CLI `--marks` / `--marks-json` / `--marks-overlay`
- **Agente:** backend-specialist
- **Prioridade:** P1
- **Depende de:** T2.2, T1.5, T3.1
- **Arquivos/pacotes afetados:** `sidecars/AutoImposerCLI/Program.cs`; novo `spec/marks-default.json`; `.bat` existente preservado
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: decisão §3.3
  - OUTPUT: parser **aditivo** (não quebra args posicionais do `.bat`); `--marks` (perfis V1), `--marks-json` (JSON próprio), `--marks-overlay` (bool)
  - VERIFY: unit do parser de args; `.bat` existente funciona sem alteração
- **Rollback:** flags default off.

#### T4.2 — `RESULT_JSON` compatível com leitores antigos
- **Agente:** backend-specialist
- **Prioridade:** P1
- **Depende de:** T4.1
- **Arquivos/pacotes afetados:** `sidecars/AutoImposerCLI/Program.cs` (`schemaVersion`, campos `marks*`)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: padrão ADR-023 §Consequências (`schemaVersion`)
  - OUTPUT: campos novos opcionais (`marksCount`, `marksReadBack`, `marksOverlayFile`); leitores antigos toleram ausência
  - VERIFY: teste de compat — parser legado com JSON novo → sem erro
- **Rollback:** manter `schemaVersion` anterior na ausência de marcas.

#### T4.3 — API: schema do job + rotas (marcas)
- **Agente:** database-architect (schema) → backend-specialist (rotas)
- **Prioridade:** P1
- **Depende de:** T4.2
- **Arquivos/pacotes afetados:** `grafica-app/backend/src/db/schema.ts` (`imposition_jobs` + `marks_config_json`, `marks_overlay`); `routes/automation.ts` (zod); `server.ts` (boot seguro das colunas — padrão Tarefa 2 do PLANO_FASE1)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: padrão Tarefas 2–3 do `PLANO_FASE1_IMPOSICAO.md`
  - OUTPUT: POST/GET/PATCH aceitando `marksConfig` (JSON tipado) e `overlay`; transições de status intactas
  - VERIFY: `npm test` (backend) verde; teste de contrato zod; boot seguro em SQLite
- **Rollback:** colunas nullable — sem quebra de jobs existentes.

#### T4.4 — Runner Electron (IPC spawn com flags)
- **Agente:** frontend-specialist
- **Prioridade:** P1
- **Depende de:** T4.3
- **Arquivos/pacotes afetados:** `electron/services/imposition-orchestrator.js` (+ testes do builder de args)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: payload via IPC com marcas/overlay
  - OUTPUT: resolve exe → monta args `--marks*`/`--marks-overlay` → spawn → parser `RESULT_JSON` → `PATCH result`
  - VERIFY: unit do builder de args; E2E manual — job com marcas vira `done` com `marksCount`
- **Rollback:** flags omitidas = comportamento atual.

#### T4.5 — UI: modal/draft seção "Marcas"
- **Agente:** frontend-specialist
- **Prioridade:** P1
- **Depende de:** T4.4
- **Arquivos/pacotes afetados:** `grafica-app/src/components/imposition/NewImpositionModal` (seção Marcas); página `/automation` (exibir marcas aplicadas)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: padrão Tarefa 5 do `PLANO_FASE1_IMPOSICAO.md`
  - OUTPUT: checkboxes crop/registro/colorbar/slugline, toggle overlay, JSON avançado opcional; resumo no job
  - VERIFY: checklist manual (UX); checagem de regras na Fase X (sem cores roxas, sem template padrão); POST via UI cria job com marcas
- **Rollback:** seção oculta por feature flag.

---

### FASE 5 — Testes & verificação

#### T5.1 — Golden-master sem marcas (Regra 2)
- **Agente:** test-engineer
- **Prioridade:** P0 — roda antes e depois de cada fase
- **Depende de:** T2.2 (validar neutralidade)
- **Arquivos/pacotes afetados:** suíte golden (convenção `TESTING_STRATEGY.md` §1/§4); CI
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: caso canônico 19×34mm em 665×986mm, sem marcas
  - OUTPUT: golden verde em CI a cada PR que toque os motores
  - VERIFY: `cols=35, rows=29, total=1015, orientation=0`; divergência = bloqueante
- **Rollback:** — (teste, não código)

#### T5.2 — Suíte unit de marcas (âncoras, duplication, JSON)
- **Agente:** test-engineer
- **Prioridade:** P1
- **Depende de:** T1.2, T1.3, T1.4
- **Arquivos/pacotes afetados:** `packages/imposition-core/tests/Imposition.Core.Tests/Marks/*`
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: casos — registro 4 cantos; crop por peça com rotação 90; colorbar esticada (2 refs); slugline com texto variável; dupflags 35/1059
  - OUTPUT: BR-030* (âncoras), BR-031* (duplication), BR-032* (serialização) verdes
  - VERIFY: `dotnet test` do pacote passa; cada caso declara tolerância 0,1mm
- **Rollback:** —

#### T5.3 — Teste de leitura do PDF overlay
- **Agente:** qa-automation-engineer
- **Prioridade:** P1
- **Depende de:** T3.1
- **Arquivos/pacotes afetados:** testes de read-back do `AutoImposerCLI`; CI
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: overlay gerado por T3.1
  - OUTPUT: parse do overlay conta somente marcas previstas
  - VERIFY: `marksReadBack(overlay) == marksCount`; dimensões == chapa
- **Rollback:** —

#### T5.4 — E2E ponta-a-ponta (CLI → API → UI) + regressão sem marcas
- **Agente:** qa-automation-engineer
- **Prioridade:** P1
- **Depende de:** T4.5, T5.1, T5.3
- **Arquivos/pacotes afetados:** fluxo completo; checklist datado
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: fluxo manual/automático
  - OUTPUT: (a) job sem marcas → resultado idêntico ao atual; (b) job com marcas → chapa com marcas + overlay; (c) resultado visível na UI
  - VERIFY: checklist datado (padrão ADR-021); screenshots das posições; checksum estável sem marcas
- **Rollback:** —

#### T5.5 — Atualização do contrato vivo (IMPOSICAO-MOTOR + docs)
- **Agente:** documentação
- **Prioridade:** P1
- **Depende de:** T1.1, T4.2
- **Arquivos/pacotes afetados:** `docs/engineering/IMPOSICAO-MOTOR.md` (nova seção "Marcas de imposição"); `docs/engineering/MARCAS_PREPS_INVENTARIO.md` (atualizado com o que foi usado)
- **INPUT → OUTPUT → VERIFY:**
  - INPUT: ADR-040 aprovado + implementação
  - OUTPUT: contrato vivo descreve `MarksSpec`, âncoras, overlay, contagem de marcas
  - VERIFY: `docs:check` verde (DOC_POLICIES P9/P10); referências cruzadas OK
- **Rollback:** —

---

## 8. Grafo de dependências (resumo)

```
FASE 0                     FASE 1                  FASE 2                 FASE 3       FASE 4                         FASE 5
T0.1 ─┐
T0.2 ─┼─▶ T1.1 ─▶ T1.2 ─┬─▶ T1.3 ─┐
T0.3 ─┘                 │        │
                        └─▶ T1.4 ─┤
                                  ▼
T0.3 (caminho A) ─▶ T2.3    T2.1 ─┴─▶ T2.2 ─▶ T3.1 ─▶ T4.1 ─▶ T4.2 ─▶ T4.3 ─▶ T4.4 ─▶ T4.5
                                  │
T5.1 roda em qualquer fase; T5.2 após T1.3/T1.4; T5.3 após T3.1; T5.4 após T4.5; T5.5 após T1.1+T4.2
```

**Ordem de implementação (prioridade):** P0 fundação (Fase 0–1) → P1 core/render (T2.x) → P2 overlay (T3.x) → P3 CLI/API/UI (T4.x) → P4 polimento/testes (T5.x).
**Paralelo:** T2.1/T2.3 (arquivos diferentes), T5.2 pode rodar durante a Fase 4. **Serial:** T1.2 → T1.3 → T2.1 → T2.2 (mesmo domínio/contrato).

---

## 9. Riscos principais

| # | Risco | Mitigação |
|---|---|---|
| R1 | **Licença dos EPS/PDF do Preps** — assets da instalação comercial Kodak; redistribuir no repo pode violar EULA | nunca commitar binários; subprocesso de ingestão a partir da instalação local OU marcas 100% nativas (recomendação inicial: nativas V1); decisão final em ADR-040 |
| R2 | **PdfSharp 6.1.1 embutir XForm de PDF existente** — `XPdfForm` pode estar imatura/removida na 6.x | T0.3 (spike) decide antes da Fase 2; plano B já previsto (geometria nativa — EPS V1 são PostScript simples) |
| R3 | **Over-engineering do modelo Preps** (refentity genérica × MVP) | enums tipados com escopo V1 (folha/peça/grade/assinatura); sem generalizar todos os refentities do Preps; expansão via ADR quando houver caso real |
| R4 | **Contagem/read-back** — marcas como XForms emitem `Do` e o `PdfReadBack.CountDrawnUnits` pode contá-las como peças, quebrando BR-010 | prefixo/padrão de nome de XObject de marca + classificação no read-back; `marksCount` separado no `RESULT_JSON`; teste obrigatório com marcas ligadas |
| R5 | **Rotação 90 da peça** — âncora de crop resolvida no espaço rotacionado aponta offset errado | âncora resolvida no espaço NÃO rotacionado (antes do Transform); caso de teste obrigatório (T5.2) |
| R6 | **Slugline com texto variável** pode transbordar a margem/sobrepor a grade | fonte dimensionada à altura máxima; truncamento com aviso em log/`RESULT_JSON` |
| R7 | **Compat de `RESULT_JSON` com leitores antigos** | campos novos opcionais + `schemaVersion` (padrão ADR-023) |

---

## 10. Questionamentos em aberto (validar em ADR futuro)

- **Q1 — Licenciamento:** podemos copiar assets do Preps para uso **interno** (sem redistribuir), ou tudo nativo? (T0.2)
- **Q2 — Slugline:** conteúdo padrão (jobName, data, máquina, tiragem?); fonte e tamanho; quem define por job?
- **Q3 — Color bar:** precisa de escala de % 0–100, patches de spot (Pantone) e perfil ICC? Base no `ColorBar.smk` (`calibratedupmark`)?
- **Q4 — Overlay:** a máquina de corte consome PDF separado no mesmo tamanho? Camada OCG (mesmo PDF) é opção futura?
- **Q5 — Importador .smk (P2):** prioridade real? (migração de presets de clientes existentes?)
- **Q6 — Escopo de substrato:** marcas em rolo (motor contínuo) e em duplex frente/verso? V1 propõe só chapa/folha (motor 1).
- **Q7 — Registro:** 4 cantos vs 1 canto + 2 meios de borda (padrão de marcenaria)? Default proposto: 4 cantos.
- **Q8 — Unidade/tolerância:** offsets em mm no JSON (Regra 1), conversão 72/25,4 no render; confirmar arredondamento a uma casa decimal.

---

## 11. FASE X — Verificação final (checklist)

> Nada de `[x]` sem executar de verdade. Rode os scripts na ordem abaixo; qualquer divergência = bloqueante.

- [ ] **Golden-master (Regra 2):** caso canônico 19×34mm em 665×986mm → 1015, orientation 0 — roda sem marcas e não muda com a feature
- [ ] **BR-010/ADR-023:** `drawnUnits == plannedUnits == readBackUnits` com marcas LIGADAS (read-back classifica `Do` de marcas e não os conta como peças)
- [ ] **Marcas:** `marksCount ==` marcas desenhadas; overlay parseável com `marksReadBack == marksCount`
- [ ] **Builds:** `dotnet build` (solução) + `dotnet test` (core — BR-030/031/032) + `npm test` (backend) verdes
- [ ] **Frontend:** `npm run build` sem erros; checagem de regras visuais (sem cores roxas; sem template padrão)
- [ ] **Docs:** `docs:check` verde (DOC_POLICIES P9/P10); ADR-040 + `ADR_INDEX` atualizados; `IMPOSICAO-MOTOR.md` com seção de marcas (T5.5)
- [ ] **Segurança/licença:** nenhum asset do Kodak commitado (`git ls-files | Select-String -Pattern 'preps|regmark.*\.eps|\.smk'` vazio); nota de licenciamento no ADR-040
- [ ] **Modo `--strict`:** golden com marcas passa sem divergência real
- [ ] **E2E manual datado (T5.4):** job com as 4 marcas V1 + overlay; screenshots das posições; checagem visual 1:1 contra Preps (ou espec) 
- [ ] **Compat:** parser legado de `RESULT_JSON` tolera campos novos (`schemaVersion`)

---

## ✅ Marca de conclusão (adicionar ao final do arquivo quando tudo passar)

```markdown
## ✅ PHASE X COMPLETE
- Lint/build: ok
- Security/licença: sem assets do Kodak no repo
- Testes: BR-010 .. BR-032 verdes + golden-master ok
- Docs: docs:check ok
- Data: [DATA]
```