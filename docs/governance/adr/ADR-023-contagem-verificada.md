
---

## 📄 Documento 3 — `docs/governance/adr/ADR-023-contagem-verificada.md`

```markdown
# ADR-023: Contagem Verificada — Instrumentação + Read-back Condicional

- **Status:** Proposto
- **Data:** 2026-09-17
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / quality / telemetry
- **Links:** BR-010, BR-021; aplica `AGENTS.md` Regra 4; depende de ADR-021.

---

## Contexto

`packages/imposition-core/AGENTS.md` **Regra 4** é explícita: *"a contagem
reportada tem que bater com a geometria real desenhada"*, e chama isso de
*"o ponto mais importante e mais fácil de violar por acidente"*. Cita o bug
histórico (CLI trunca vs JSX preenche última linha) como violação exata.

`IMPOSICAO-MOTOR.md` §5.3 registra que o `targetCopies` é **ignorado** no
fluxo `.bat`, e que o motor 1 (`Program.cs:226-256`) trunca enquanto o motor 2
(`engine.jsx:135-168`) preenche a última linha. §5.9 aponta que o motor 4
(Konica) ignora alvo por completo.

Adicionalmente, o motor 2 exporta PDF A8 via `PDFSaveOptions`
(`engine.jsx:170-176`) — Adobe pode mesclar e comprimir XObjects. Parsear o
PDF resultante para contagem é **não determinístico**.

---

## Decisão

### 1. Matriz motor × confiabilidade de read-back

| Motor | Instrumentado no loop | Read-back content stream | Fonte de verdade |
|---|---|---|---|
| AutoImposerCLI (.NET/PdfSharp) | sim | **sim** — parse `Do`/XObject da peça | instrumentado **+** read-back |
| IllustratorImposerCLI (COM/JSX) | sim (`copies_geradas`) | **não** (A8 indeterminístico) | `copies_geradas` do `engine.jsx` |
| ImpositorKonica (WPF/Skia) | sim | **sim** (Skia emite XObjects controlados) | instrumentado **+** read-back |
| `imposition-grid` (NativeAOT) | sim (planejado) | N/A | planejado |

### 2. Campos no `RESULT_JSON`

- `plannedUnits` — `placements.Count` do core (contrato `ADR-021`).
- `drawnUnits` — incrementado **dentro do loop** de `DrawImage`/`duplicate`.
  Nunca derivado do plano.
- `readBackUnits` — `-1` quando não aplicável; valor real quando o motor
  suporta read-back confiável.

### 3. Política de divergência

- Divergência > 0 → modo `--strict` aborta com exit code do motor
  (CLI `1`; Illustrator `2` se aplicável; Konica `3`).
- Modo `--warn` (default em produção) → log estruturado + exit `0`.
- Modo `--strict` só é ligado após 5 dias consecutivos em produção sombra
  sem divergência (ver ADR-021 §Nota de honestidade).

### 4. Cobertura por motor

- **Motor 1 (PdfSharp):** read-back completo obrigatório em CI para todos os
  goldens. Em produção, read-back roda opcionalmente em modo `--strict`.
- **Motor 2 (Illustrator):** valida `copies_geradas` reportado pelo
  `engine.jsx` contra o plano. **Nunca** parseia o PDF A8 resultante.
- **Motor 4 (Konica):** read-back completo em CI; GUI/operador coberto por
  teste manual datado.

### 5. Telemetria

Divergência é evento Serilog estruturado com `correlationId`,
`machineProfileHash`, `gridHash`, `planned`, `drawn`, `readBack`. Nenhum
valor é agregado sem identificador de máquina.

---

## Consequências

### Positivas

- Regra 4 executável, não performativa.
- Zero custo no hot-path PdfSharp (read-back só em CI ou `--strict`).
- Motor 2 coberto por contagem cruzada — sem falso-negativo de parse A8.
- Divergência vira dado auditável, não bug silencioso.
- Conformidade com `TESTING_STRATEGY.md` §2 (BR-*).

### Negativas / Mitigações

- **Motor 2 tem um caminho não coberto por read-back** — documentado
  explicitamente aqui (P8 — status honesto). Mitigação: teste de contrato
  do `engine.jsx` valida `copies_geradas` contra plano em CI com stub.
- Requer `engine.jsx` confiável no reporte. Se o engine mudar
  semanticamente, o teste de contrato quebra o build.
- `RESULT_JSON` ganha 2 campos novos → compat com leitores antigos via
  `schemaVersion` (Regra 6 do pacote).

### Alternativas rejeitadas

- **Read-back puro em todo job.** Não confiável no Illustrator (A8
  indeterminístico); gera falso-negativo em produção.
- **Só contador em memória, sem read-back.** Não valida geometria de fato —
  exatamente o que a Regra 4 quer evitar.

---

## Verificação

- `it('BR-010.x: plannedUnits == placements.Count em todo golden')`
- `it('BR-010.y: drawnUnits == plannedUnits em modo --strict')`
- `it('BR-010.z: read-back PdfSharp bate com plano em 100% dos goldens')`
- `it('BR-010.w: engine.jsx copies_geradas == plannedUnits em CI com stub')`
- CI reprova qualquer divergência; produção loga e alerta.

## Gatilhos para Reavaliação

- Adobe Illustrator muda o pipeline de PDF/X a ponto do parse de XObject se
  tornar determinístico.
- Primeiro incidente de divergência de contagem em produção que o modo
  `--warn` não detectou.

---

`source: packages/imposition-core/AGENTS.md:Regra 4` · `docs/engineering/IMPOSICAO-MOTOR.md:§5.3,§5.9` · `sidecars/IllustratorImposerCLI/Scripts/engine.jsx:135-176`