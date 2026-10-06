# ADR-055: Contrato de Automação Headless CLI de Emendas (`seams-cli`)

- **Status:** Aprovada
- **Data:** 2026-10-06
- **Autor:** GraficaOS Engineering
- **Regras Relacionadas:** R-009, R-013, R-019, R-020
- **Regra de Negócio:** BR-056
- **Contexto:** Módulo de Emendas de Grandes Formatos (`seams`), Feature 7 (`docs/engineering/SEAMS-PLANO-FEATURES.md`)

---

## 1. Contexto

A automação de pré-impressão para grandes formatos (banners, fachadas, lonas) demanda execução não assistida via scripts, filas de processamento, agentes de background e pastas quentes (hot folders).

As features anteriores consolidaram:
- O cálculo de painéis e gestão de rolos em `imposition-core` (ADR-049, ADR-050).
- As linhas-guia K40% (ADR-051).
- O motor de preview e renderização raster (ADR-052).
- A exportação em lote de imagens JPG CMYK de alta resolução via libjpeg-turbo (ADR-053).
- A exportação vetorial de painéis em conformidade com PDF/X-1a ISO 15930-1 via QDF gerenciado (ADR-054).

Esta ADR formaliza o contrato público da ferramenta headless de linha de comando (`SeamsCLI`) que orquestra todo o ciclo de vida do pipeline de emendas.

---

## 2. Decisões Arquiteturais

### Decisão 1: Parser e CLI Framework via `System.CommandLine`
O utilitário `SeamsCLI` adota oficialmente `System.CommandLine` como biblioteca padrão do .NET 10 para análise de argumentos e opções.
- Mensagens de ajuda (`--help`) e erros estruturados em português (PT-BR).
- Argumentos posicionais e opções nomeadas fortemente tipadas.

### Decisão 2: Defaults Operacionais Corrigidos
Para refletir a realidade operacional brasileira de comunicação visual:
- `--roll`: **1520 mm** (largura padrão comercial de rolos de lona/vinil).
- `--overlap`: **10 mm** (largura canônica para sobreposição de solda/cola).
- `--margin`: **15 mm** (margem de segurança nas laterais da bobina).

### Decisão 3: Relação entre Formato de Entrada e Saída
- **Inferência Padrão:** O formato de saída é inferido automaticamente da extensão do arquivo de entrada:
  - Arquivos `.jpg`, `.jpeg`, `.tif`, `.tiff` produzem painéis `jpg` (via `JpgPanelExporter`).
  - Arquivos `.pdf` produzem painéis `pdf` (via `PdfxPanelExporter`).
- **Restrição Estrita:** A flag `--format` aceita apenas `jpg` ou `pdf` e não admite conversão cruzada no MVP. Passar uma imagem JPG com `--format pdf` aborta imediatamente com exit code 1 e código de erro `E_FORMAT_MISMATCH`.

### Decisão 4: Detecção de Dimensões, Fallback e Overrides
- Em PDFs, as dimensões físicas em mm são extraídas do `/MediaBox` ou `/CropBox` via parser QDF.
- Em imagens raster (JPG/TIFF), as dimensões são calculadas a partir de pixels e DPI embutido. Na ausência de DPI, aplica-se o fallback de 300 DPI e adiciona-se uma advertência em `warnings`.
- Parâmetros opcionais `-w, --width <mm>` e `--height <mm>` (sem flag curta `-H`) permitem sobrepor as dimensões detectadas. Quando aplicados a PDFs, um aviso é gerado em `warnings` e emitido em `stderr` se `--verbose` estiver ativo.

### Decisão 5: Separação de Streams (stdout vs stderr)
- `stdout` é reservado **exclusivamente** para o resultado estruturado (`RESULT_JSON` em linha única quando `--json` ativo) ou mensagem final concisa de sucesso.
- `stderr` é utilizado para todos os logs, advertências, progresso de fatiamento (`--verbose`) e mensagens de erro legíveis.

### Decisão 6: Modelo de Dados do `RESULT_JSON` e Falha Parcial
- Sempre emitido em linha única compacta (`camelCase`).
- Campo `"schemaVersion": "1.0"` obrigatório.
- Lista `"warnings": []` sempre presente.
- Nomes em `"generatedFiles"` utilizam separadores nativos de sistema de arquivos via `Path.Combine`.
- **Emissão Garantida em Erro:** Quando `--json` for solicitado, mesmo em caso de falha de validação ou aborto, o JSON é emitido com `"success": false`, `"errorCode": "..."` e `"errorMessage": "..."`.
- **Falha Parcial (Decisão A):** Se a exportação falhar durante o processamento de painéis, `"success": false`, `"errorCode"` contém a falha e `"generatedFiles"` contém a relação de painéis finalizados antes do erro.

### Decisão 7: Políticas de I/O
- Se a pasta informada em `-d, --outdir` não existir, é criada automaticamente.
- Arquivos de saída existentes são sobrescritos silenciosamente para garantir idempotência em reprocessamentos.

### Decisão 8: Cancelamento Gracioso no Windows (Exit Code 130)
- O CLI captura o evento `Console.CancelKeyPress`.
- O sinal cancela o `CancellationTokenSource`, os exporters interrompem o trabalho, quaisquer arquivos temporários `.tmp` em disco são removidos e a aplicação encerra imediatamente com `Environment.Exit(130)`.

---

## 3. Tabela Canônica de Exit Codes

| Exit Code | Categoria | Descrição | ErrorCodes Mapeados |
|---|---|---|---|
| **0** | Sucesso | Todos os painéis exportados com êxito | `null` |
| **1** | Entrada Inválida | Parâmetros inválidos, R-013 violada, arquivo não existe, mismatch de formato | `E_INPUT_NOT_FOUND`, `E_INVALID_ARGUMENT`, `E_INVALID_DIMENSION`, `E_INVALID_OVERLAP`, `E_FORMAT_MISMATCH` |
| **2** | Erro de Cálculo | Parâmetros geométricos inviabilizam o fatiamento | `E_ROLL_TOO_NARROW`, `E_SEAMS_OVERLAP_EXCEEDS_ROLL`, `E_SEAMS_ARTWORK_EXCEEDS_MAX_PANELS` |
| **3** | Erro de Exportação / Preflight | Fonte não é CMYK (R-020), presença de OCG, não conformidade PDF/X | `E_EXPORT_SOURCE_NOT_CMYK`, `E_SOURCE_HAS_OCG`, `E_PDFX_NON_COMPLIANT`, `E_INVALID_ICC_PROFILE` |
| **4** | Erro de I/O e Sistema | Falha de disco, permissão negada, arquivo travado | `E_IO_ERROR`, `E_ACCESS_DENIED` |
| **130** | Cancelamento | Operação abortada pelo operador via SIGINT / Ctrl+C | `E_OPERATION_CANCELED` |

---

## 4. Conformidade com Regras Globais
- **R-009:** ADR registrada em modo append-only em `ADR_INDEX.md` sem corrupção de encoding.
- **R-013:** Validação rigorosa de todos os valores `double` com `!double.IsFinite(x) || x <= 0`.
- **R-019:** Campos do resultado estruturado derivados estritamente após a conclusão das operações.
- **R-020:** O CLI rejeita fontes RGB e garante saída estritamente CMYK em JPG e PDF/X-1a.
