# Design Document: Utilitário Headless de Emendas (`seams-cli`)

**Data:** 2026-10-06  
**Status:** Aprovado  
**Branch Alvo:** `feat/seams-cli`  
**Referência:** `docs/engineering/SEAMS-PLANO-FEATURES.md` (Feature 7)  
**Domínio de Regra de Negócio:** `BR-056` (a reservar em `docs/business/BUSINESS_RULES.md`)  
**ADR Correspondente:** `ADR-055` (Contrato do CLI de Emendas Headless)  

---

## 1. Visão Geral e Contexto

O `SeamsCLI` é um utilitário de linha de comando headless em .NET 10 localizado em `sidecars/SeamsCLI`, projetado para automatizar o pipeline completo de fatiamento de emendas (*seams*) em fluxos de trabalho não interativos (integração ERP, scripts de pré-impressão, automações de pasta quente e pipelines CI/CD).

Ele consome as regras geométricas puras de `imposition-core`, os motores de renderização e fatiamento raster de `imposition-render` (JPG CMYK) e o fatiamento vetorial PDF/X-1a de `imposition-pdf`, fornecendo uma interface padronizada, robusta contra parâmetros inválidos (R-013), com garantia de espaço de cor CMYK (R-020) e saída estruturada via `RESULT_JSON` em `stdout`.

---

## 2. Decisões Arquiteturais Fechadas (Base da ADR-055)

### Decisão 1: Parser Moderno com `System.CommandLine`
- Utiliza a biblioteca oficial `System.CommandLine` do ecossistema .NET 10.
- Suporte nativo a validação fortemente tipada, geração automática de `--help` em português (PT-BR) e tratamento de opções posicionais e nomeadas.

### Decisão 2: Correção de Defaults Operacionais da Indústria Gráfica
Em conformidade com a realidade operacional de grandes formatos (comunicação visual), os defaults do CLI são corrigidos em relação aos rascunhos iniciais:
- `--roll`: **1520 mm** (largura padrão de bobinas no mercado brasileiro; e não 1600 mm).
- `--overlap`: **10 mm** (sobreposição padrão de solda térmica/alta frequência; e não 30 mm).
- `--margin`: **15 mm** (margem de segurança nas bordas do rolo).

### Decisão 3: Relação entre Entrada e Saída (Sem Conversão Cruzada no MVP)
- **Inferência Padrão:** Se `--format` for omitido, a extensão do arquivo de entrada define o formato de saída:
  - `.jpg`, `.jpeg`, `.tif`, `.tiff` → infere `jpg` (via `JpgPanelExporter`).
  - `.pdf` → infere `pdf` (via `PdfxPanelExporter`).
- **Restrição Estrita:** Se `--format` for passado explicitamente, ele deve coincidir com a família do arquivo de origem. Passar um arquivo JPG com `--format pdf` aborta imediatamente com erro `E_FORMAT_MISMATCH` (exit code 1).
- Conversões cruzadas (rasterizar PDF para JPG ou encapsular fatias de JPG em PDF vetorial) ficam explicitamente fora do escopo do MVP, garantindo fidelidade vetorial do PDF/X-1a e prevenindo violações da regra R-020.

### Decisão 4: Detecção de Dimensões com Fallback e Overrides
- **PDF:** As dimensões físicas padrão são extraídas do `/MediaBox` ou `/CropBox` via parser QDF gerenciado em C# ($pt \times 25.4 / 72.0$).
- **JPG/TIFF:** As dimensões físicas são extraídas da largura/altura em pixels combinadas com a densidade de pontos por polegada (DPI) dos metadados JFIF/EXIF. Se o arquivo não contiver metadados de DPI, o CLI assume o fallback de **300 DPI** e registra um aviso na lista de `warnings`.
- **Overrides:** O operador pode sobrescrever as dimensões físicas passando `-w, --width <mm>` e/ou `--height <mm>` (a flag curta `-H` foi removida para evitar conflito com `-h`/`--help`). Quando um override for aplicado a um arquivo PDF, um aviso é registrado em `warnings` e emitido em `stderr` (se `--verbose` ativo).

### Decisão 5: Separação Rigorosa de Fluxos (stdout vs stderr)
- **`stdout`:** Reservado **exclusivamente** para o payload de resultado estruturado `RESULT_JSON` (quando `--json` ativo) ou mensagem final concisa de sucesso.
- **`stderr`:** Utilizado para todos os logs informativos, barras de progresso, advertências e mensagens de erro (quando `--verbose` ativo ou na ocorrência de falhas).
- Isso permite que utilitários de shell consumam a saída diretamente via pipe (`SeamsCLI ... --json | jq .`) sem contaminação por texto de log.

### Decisão 6: Modelo de Dados do `RESULT_JSON`
O JSON emitido é uma única linha compacta em `camelCase`:
- Inicia obrigatoriamente com `"schemaVersion": "1.0"`.
- Possui a lista `"warnings": [...]` sempre presente (mesmo quando vazia).
- Emprega caminhos nativos de plataforma em `"generatedFiles"` via `Path.Combine` (`\` no Windows, `/` no Linux).
- **Emissão Garantida em Erro:** Se `--json` estiver ativo, mesmo em falhas de entrada, preflight ou execução, o JSON é emitido com `"success": false`, `"errorCode": "..."` e `"errorMessage": "..."`.
- **Modelagem de Falha Parcial (Decisão A):** Se a exportação falhar após alguns painéis já terem sido gravados, `"success": false`, `"errorCode"` contém a razão da quebra e `"generatedFiles"` lista os arquivos que chegaram a ser concluídos antes da falha.

### Decisão 7: Políticas de I/O e Idempotência
- Se o diretório especificado em `-d, --outdir` não existir, o CLI o cria automaticamente recursivamente (`Directory.CreateDirectory`).
- Se arquivos com o mesmo nome de destino já existirem, eles são sobrescritos silenciosamente para garantir idempotência em reprocessamentos de jobs.

### Decisão 8: Cancelamento Gracioso no Windows (Ctrl+C / SIGINT)
- O CLI intercepta `Console.CancelKeyPress`.
- O `CancellationToken` é disparado imediatamente para interromper os laços de fatiamento nos exporters.
- Arquivos temporários inacabados (`.tmp`) são removidos do disco.
- O processo finaliza explicitamente com `Environment.Exit(130)` (código canônico de interrupção por sinal).

---

## 3. Tabela Canônica de Códigos de Saída (Exit Codes)

| Exit Code | Categoria | Descrição | ErrorCodes Mapeados |
|---|---|---|---|
| **0** | Sucesso | Todos os painéis foram fatiados e gravados com êxito | `null` |
| **1** | Entrada Inválida | Parâmetros de linha de comando inválidos, violação de R-013, arquivo não encontrado, mismatch de formato | `E_INPUT_NOT_FOUND`, `E_INVALID_ARGUMENT`, `E_INVALID_DIMENSION`, `E_INVALID_OVERLAP`, `E_FORMAT_MISMATCH` |
| **2** | Erro de Cálculo | Parâmetros geométricos inviabilizam o cálculo de fatiamento | `E_ROLL_TOO_NARROW`, `E_SEAMS_OVERLAP_EXCEEDS_ROLL`, `E_SEAMS_ARTWORK_EXCEEDS_MAX_PANELS` |
| **3** | Erro de Exportação / Preflight | Imagem/PDF não é CMYK (R-020), presença de OCG, falha de conformidade PDF/X | `E_EXPORT_SOURCE_NOT_CMYK`, `E_SOURCE_HAS_OCG`, `E_PDFX_NON_COMPLIANT`, `E_INVALID_ICC_PROFILE` |
| **4** | Erro de I/O e Sistema | Falha de permissão em disco, espaço insuficiente ou erro de escrita | `E_IO_ERROR`, `E_ACCESS_DENIED` |
| **130** | Cancelamento | Execução interrompida pelo operador via SIGINT / Ctrl+C (limpeza de `.tmp`) | `E_OPERATION_CANCELED` |

---

## 4. Estrutura do `RESULT_JSON`

```json
{
  "schemaVersion": "1.0",
  "success": true,
  "panelCount": 3,
  "generatedFiles": [
    "C:\\Saida\\painel_01.pdf",
    "C:\\Saida\\painel_02.pdf",
    "C:\\Saida\\painel_03.pdf"
  ],
  "totalLinearLengthMeters": 4.56,
  "elapsedMs": 340,
  "warnings": [
    "Resolução DPI não detectada na imagem de origem; adotado fallback de 300 DPI."
  ],
  "errorCode": null,
  "errorMessage": null
}
```

---

## 5. Estrutura dos Componentes

```
sidecars/SeamsCLI/
├── SeamsCLI.csproj
├── Program.cs
├── CommandLine/
│   ├── SeamsCliOptions.cs
│   └── SeamsCliParser.cs
├── Execution/
│   ├── SeamsWorkflowResult.cs
│   ├── SeamsWorkflowExecutor.cs
│   └── JsonResultEmitter.cs
└── tests/
    └── SeamsCLI.Tests/
        ├── CommandLine/
        │   └── SeamsCliParserTests.cs
        ├── Execution/
        │   ├── SeamsWorkflowExecutorTests.cs
        │   └── JsonResultEmitterTests.cs
        └── Integration/
            └── CliIntegrationTests.cs
```
