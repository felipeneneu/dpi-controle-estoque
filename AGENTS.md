# AGENTS.md — dpi-controle-estoque (GraficaOS)

> Este arquivo é lido automaticamente por agentes de IA. Define o
> contexto global do monorepo. Regras específicas por pacote ficam em
> `packages/*/AGENTS.md`.

## O que é este repo

Monorepo do **GraficaOS** — sistema de gestão + automação de pré-impressão
para gráficas. Combina ERP (Node/TS), motores de imposição (C#), UI
(Electron + WPF).

## Stack

| Camada | Linguagem | Onde |
|---|---|---|
| ERP / backend | TypeScript / Node | `grafica-app/`, `electron/` |
| Motores de imposição | **C# (.NET 10)** | `sidecars/`, `packages/` |
| Core geométrico | **C# puro (sem IO)** | `packages/imposition-core/` |
| Manipulação PDF | C# + QPDF | `packages/imposition-pdf/` |
| Spike (descartável) | Qualquer | `spikes/` (ignorado por git) |

## Leitura obrigatória antes de codar

1. `docs/engineering/IMPOSICAO-MOTOR.md` — contrato vivo do motor
2. `docs/governance/DOC_POLICIES.md` — P1–P11 (regras de docs)
3. `docs/engineering/TESTING_STRATEGY.md` — convenção BR-*
4. `docs/governance/ADR_INDEX.md` — decisões registradas
5. `packages/imposition-core/AGENTS.md` — Regras 1–9 do core
6. O `AGENTS.md` do pacote específico em que vai trabalhar

## SDD obrigatório para novos módulos

Todo módulo ou feature de produto entra via ciclo SDD com:
- Contratos públicos fechados no documento de planejamento antes do código.
- Task 0 obrigatória para ADR (se houver mudança de contrato).
- Ledger em `.sdd/<feature>/progress.md`.
- Dupla revisão (Spec + Code Quality).
- Regras R-009, R-013, R-019 aplicadas no prompt de implementação.

Critério de saúde do ciclo: ≤ 2 rulings totais, 0 de contrato.
Se passar de 5 rulings, o planejamento falhou — parar e revisar.

## Convenções C#

1. **PT-BR** em comentários, docs e mensagens de erro (P7 do DOC_POLICIES).
2. **English** em identificadores (classes, métodos, variáveis).
3. **`net10.0`** (ou `net10.0-windows` para WPF).
4. **`TreatWarningsAsErrors=true`** — zero warnings no build.
5. **`Nullable=enable`**.
6. **`ImplicitUsings=enable`**.
7. **`double`** para geometria — **nunca** `decimal`/Big.js.
8. **Tolerância explícita** `max(tol, register, 0.1)` **antes** do `floor`.
   Nunca epsilon mágico (`+0.000001`).
9. **`Math.Round(x, 2)`** apenas na serialização (mm com 2 casas).
10. **Sem IO** em `imposition-core` (Regra 8 — puro).
11. **IO permitido** em `imposition-pdf` e `sidecars/*`.
12. **Records** para DTOs imutáveis.
13. **`async`/`await`** para IO (não em cálculo puro).
14. **Encoding legado: nunca read-modify-write** (regra R-009). Arquivo com
    histórico de mojibake (ex.: `docs/governance/ADR_INDEX.md`) **não** pode ser
    reescrito por read-modify-write do arquivo inteiro. A inserção tem de ser
    append-only, ou restaurar antes com `git checkout --` e reinserir sem tocar os
    bytes existentes. Perder bytes que "já estavam ruins" ainda é perder dado.
    Verificado empiricamente em 2026-09-30, ruling R-009 da slugline: no título do
    ADR-044 os bytes `C3 BE C3 92` viraram `EF BF BD EF BF BD` (2x U+FFFD) quando o
    arquivo foi reescrito inteiro.
15. **Validação de `double` sempre com `IsFinite`** (regra R-013). `NaN <= 0` e
    `NaN > 0` são **ambos** `false`: qualquer validação de `double` feita só com
    comparações (`<=`, `<`, `>`, `>=`) deixa passar `NaN` e `±Infinity`. Toda
    validação tem de usar `!double.IsFinite(x) || x <= 0` (ou equivalente).
    Verificado empiricamente em 2026-09-30, ruling R-013 da slugline: `double.NaN`
    passava em `SheetWidthMm <= 0` e gerava geometria `NaN`.
16. **Campos de desfecho só depois da operação** (regra R-019). Campo de resultado
    em `RESULT_JSON` (ex.: `sluglineInfo`, `status`, `outputPath`) **não** pode ser
    preenchido antes da operação que o produz. Predição escrita antes do fato é
    ficção: em erro, o `RESULT_JSON` mente. Todo campo de resultado tem de ser
    derivado **dentro** do fluxo, **após** a operação correspondente.
    Verificado empiricamente em 2026-09-30, ruling R-019 da slugline:
    `sluglineInfo = "desenhada"` era escrito antes de `PdfImposer.Impose`, e
    mentia no caminho de erro.

## Estrutura de pacotes

- `packages/imposition-core/` — cálculo puro (grid, tolerância, duplex).
  **Sem IO. Sem PackageReference.**
- `packages/imposition-pdf/` — manipulação PDF (QPDF, OCG, N-up).
  **IO permitido.**
- `sidecars/AutoImposerCLI/` — motor headless (consome os 2 pacotes).
- `sidecars/IllustratorImposerCLI/` — wrapper Illustrator COM.
- `sidecars/ImpositorKonica/` — WPF interativo.
- `spikes/` — código descartável. **Nunca commitar. Não entra em produção.**

## NUNCA fazer

- ❌ PdfSharp para escrita de PDF com OCG (achata camadas — ver ADR-041).
- ❌ iText, Syncfusion, Aspose (licenças AGPL/comerciais).
- ❌ `decimal`/Big.js para geometria.
- ❌ Epsilon mágico.
- ❌ Reflection para contornar APIs.
- ❌ IO dentro de `imposition-core`.
- ❌ Renomear spots de PDF (`RDG_WHITE` sai como `RDG_WHITE`).
- ❌ Commitar `bin/`, `obj/`, `qpdf.exe`, PDFs de cliente.
- ❌ Python em produção (só `spikes/`).
- ❌ Ajustar teste para passar (se quebrou, é bug).
- ❌ Alterar contrato público sem ADR.

## Padrões de commit
