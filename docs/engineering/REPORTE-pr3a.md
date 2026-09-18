# Relatório Final — PR #3a (AutoImposerCLI + Imposition.Core)

## 1. Resumo da Leitura
O PR #3a migrou o motor 1 (`AutoImposerCLI`) para consumir a `GridSearchEngine` do `imposition-core` como fonte única de verdade de grade, eliminando a decisão local de orientação por área. Implementou-se também a contagem instrumentada e o read-back de XObjects gerados pelo PdfSharp, validando a integridade (`drawnUnits` == `plannedUnits` == `readBackUnits`). O CLI foi atualizado para suportar novos campos no `RESULT_JSON` e modos `--strict`/`--warn`, honrando os guardrails do ADR-021 e ADR-023.

## 2. Arquivos Criados/Modificados
### Criados
- `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/AutoImposerCLI.Tests.csproj`
- `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/CrossMotorTests.cs`
- `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/GoldenMaster/cases/000-canonical/input.json`
- `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/GoldenMaster/cases/000-canonical/expected.json`
- `sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests/GoldenMaster/CrossMotorGoldenTests.cs`
- `docs/engineering/REPORTE-pr3a.md` (Este arquivo)

### Modificados (Anteriormente e neste patch)
- `sidecars/AutoImposerCLI/AutoImposerCLI.csproj` (Adicionado ProjectReference e exclusão da pasta tests)
- `docs/engineering/IMPOSICAO-MOTOR.md` (Atualizado §5.1 e §5.3 refletindo a resolução no Motor 1)

*(Nota: Os arquivos `ImpositionBridge.cs`, `CountIntegrity.cs`, `PdfReadBack.cs` e a refatoração base de `Program.cs` já haviam sido criados/modificados no checkpoint anterior ao plano).*

## 3. Saída de Build da Solução Unificada
```
dotnet build packages/imposition.slnx -c Release

Compilação com êxito.
    0 Aviso(s)
    0 Erro(s)
```
*(Nota: O arquivo `imposition.slnx` agora contém 7 projetos, incluindo o `AutoImposerCLI.Tests`).*

## 4. Testes do AutoImposerCLI
```
dotnet test sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests -c Release

Execução de teste para ...\AutoImposerCLI.Tests.dll (.NETCoreApp,Version=v10.0)
Aprovado!  – Com falha:     0, Aprovado:     3, Ignorado:     0, Total:     3, Duração: 82 ms
```

## 5. Testes do Imposition.Core
```
dotnet test packages/imposition-core -c Release

Execução de teste para ...\Imposition.Core.Tests.dll (.NETCoreApp,Version=v10.0)
Aprovado!  – Com falha:     0, Aprovado:    25, Ignorado:     0, Total:    25, Duração: 38 ms
```

## 6. Output do .bat (Smoke Test Canônico - dummy_19x34.pdf)
```
.\Impor_70x100.bat dummy_19x34.pdf 665 986 0 0

============================================================
PROCESSANDO IMPOSICAO...
Chapa: 665 x 986 mm, Gap: 0 mm, Margem: 0 mm, Rotacao: auto
============================================================

------------------------------------------------------------
ARQUIVO:       dummy_19x34.pdf (19.0 x 34.0 mm)
SUBSTRATO:     665 x 986 mm (Margens T/R/B/L: 0/0/0/0 | Gap: 0mm)
ORIENTAÇÃO:    DIRETO (0°)
APROVEITAMENTO: 1015 UN (35 colunas x 29 linhas)
PEÇA SLOT:     19.0 x 34.0 mm
------------------------------------------------------------
[OK] Contagem verificada: [BR-010/ADR-023] plannedUnits=1015 drawnUnits=1015; readBackUnits=1015
[SUCESSO] PDF gerado em:
dummy_19x34_IMPOSTO_665x986mm_1015UN.pdf
          1015 unidades (35×29) em 154ms
```

## 7. Declaração
"Não alterei o core, o grid-cli, os `.bat` nem o naming de saída. O read-back foi implementado como best-effort em modo warn por padrão. O artefato do golden-master agora respeita exatamente a estrutura aninhada do motor primário."

## 8. Relatório da Assinatura e Integração
Conforme requisitado no escopo (E.1) da missão:
- **CI do CLI**: A proteção de CI foi adicionada diretamente no workflow existente `.github/workflows/imposition-core.yml`, estendendo o `working-directory` para executar `dotnet test ../../sidecars/AutoImposerCLI/tests/AutoImposerCLI.Tests` (Opção A escolhida e recomendada). Além disso, foram adicionados gatilhos no `paths` para `sidecars/AutoImposerCLI/**`.
- **Assinatura final de `ImpositionBridge.BuildInput` implementada:**
  ```csharp
  public static ImpositionInput BuildInput(
      double sheetWidthMm,
      double sheetHeightMm,
      double gapMm,
      double marginTopMm,
      double marginRightMm,
      double marginBottomMm,
      double marginLeftMm,
      double pieceWidthMm,
      double pieceHeightMm,
      int targetCopies,
      Orientation? forcedOrientation = null)
  ```

## 9. Divergências
- O `PdfReadBack` funcionou conforme o esperado para contar a inserção dos Forms (`XObject`), reportando 100% de integridade com o planejamento emitido pelo bridge.
