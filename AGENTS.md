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
