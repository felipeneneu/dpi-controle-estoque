# ADR-048: Modo Automático da Slugline (--slugline auto)

- **Status:** Proposto
- **Data:** 2026-09-30
- **Autor:** Felipe Neneu / GraficaOS Core Team
- **Domínio:** imposition / prepress
- **Links:** BR-010, BR-021; complementa ADR-047; observa ADR-043, ADR-044.

## Contexto

A ADR-047 definiu a arquitetura da slugline de imposição e estabeleceu a geração de
uma linha técnica de rodapé padronizada (`FormatTechnicalLine` no core:
`{FileName}  {ImpositionTime:dd/MM/yyyy HH:mm}  {Cols}x{Rows}={Total}  {SheetWidthMm:0.#}x{SheetHeightMm:0.#}mm`),
além do suporte a texto customizado.

No entanto, o contrato inicial da CLI (`AutoImposerCLI`) expunha `--slugline <texto>`
repassando incondicionalmente o argumento como `CustomText`. Com isso, `CustomText`
nunca era nulo e a função `FormatTechnicalLine` permanecia inalcançável através da CLI,
conforme registrado no relatório da feature slugline (ruling R-019 item 2 e pendência N4-7).

## Decisão

Adotar a convenção **`--slugline auto`** (Opção A) para acionar a geração automática
da linha técnica de imposição.

### 1. Semântica de `--slugline auto`
- Quando a flag `--slugline` receber o valor `"auto"` (comparação sem distinção de maiúsculas/minúsculas, `StringComparison.OrdinalIgnoreCase`), a CLI instancia `SluglineOptions` com `CustomText = null`.
- O `QdfPipeline` propaga `CustomText = null` no `SluglineInput` entregue a `SluglineCalculator.Calculate`.
- O `SluglineCalculator.Calculate` executa `SluglineFormatter.FormatTechnicalLine(input)` quando `CustomText` for nulo ou whitespace, formatando os metadados técnicos reais da imposição.
- Se o usuário fornecer qualquer outro texto não vazio (ex.: `--slugline "Cliente ABC"`), este é tratado como texto customizado.
- Se `--slugline` for omitida ou receber string vazia/inválida, nenhuma slugline é desenhada (`Slugline = null`).

### 2. RESULT_JSON e Rastreabilidade
- Quando `--slugline auto` for utilizado, o `RESULT_JSON` reporta `sluglineInfo` conforme o desfecho real da linha técnica formatada (ex.: `"desenhada"` ou `"desenhada_truncada"`).

## Alternativas Rejeitadas

- **Opção B — Flag própria `--slugline-auto`:**
  Exigir duas flags separadas (`--slugline <texto>` e `--slugline-auto`) adicionaria ruído à interface de linha de comando e exigiria tratamento complexo de conflito/precedência caso ambas fossem informadas simultaneamente.
- **Opção C — Remover `FormatTechnicalLine` do core:**
  Eliminaria a funcionalidade de rodapé técnico automático, que é o caso de uso primário para operadores de produção gráfica identificarem chapas e realizarem conciliação de tiragem sem necessidade de digitação manual de metadados.

## Consequências

### Positivas
- Preserva e integra 100% da lógica e dos testes unitários já existentes no core (`SluglineFormatter.FormatTechnicalLine` e `SluglineCalculator`).
- Interface de linha de comando intuitiva e idiomática (`--slugline auto`).
- Semântica única através de um único parâmetro de CLI.

### Negativas / Mitigações
- Para imprimir o texto literal "auto" como texto customizado (caso extremo e improvável em ambiente gráfico), o operador pode fornecer `"auto "` (com espaço) ou `"AUTO - custom"`.
