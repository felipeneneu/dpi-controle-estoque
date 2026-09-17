# packages/imposition-core

**Fonte única de verdade da imposição** — ver
`docs/engineering/IMPOSICAO-MOTOR.md` §6 e `docs/governance/adr/ADR-021`.

## Regras do pacote

Leia `AGENTS.md` **antes** de tocar em qualquer coisa. Resumo:

1. **Tolerância explícita** — `tol = max(toleranceMm, registerMm, 0.1)`
   aplicada **antes** de qualquer `floor`/`%`. Nunca `decimal`/Big.js. Nunca
   epsilon mágico (Regra 1).
2. **Golden-master é lei** — `case 000-canonical` deve passar em todo PR.
   Mudança no `expected.json` exige ADR + justificativa escrita (Regra 2).
3. **Nunca transbordar silenciosamente** — rolo auto-estende até
   `maxLengthMm`; folha rejeita (`E_GRID_OVERFLOW`) se não cabe (Regra 3).
4. **`plannedUnits == geometria desenhada`** — contagem sempre verificada
   (`ADR-023`) (Regra 4).
5. **Duplex é wrapper** — Head-to-Head / Head-to-Foot (`ADR-022`), nunca
   lógica de espelhamento dentro do core (Regra 5).
6. **Mudança de contrato = ADR** — sempre, sem exceção (Regra 6).
7. **MachineProfile imutável e versionado** (Regra 7 — v2).
8. **Nada de IO no core** — sem arquivos, sem rede, sem PDF (Regra 8).
9. **Fail fast, fail loud** — toda falha tem código (`E_*`) e mensagem
   (Regra 9).

## Build

```bash
dotnet restore
dotnet build -c Release   # warnings as errors
dotnet test  -c Release   # 13+ testes + golden canônico