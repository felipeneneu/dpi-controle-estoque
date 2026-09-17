# Reporte Final — Source-Generated JSON no `imposition-grid-cli`

Extensão do PR #3-00 (migração .NET 8 → .NET 10): eliminação dos avisos IL2026/IL3050 do `imposition-grid-cli` (PublishAot) via `JsonSerializerContext` source-generated, sem mudanças de contrato ou comportamento.

---

## 1. Novo arquivo: `packages/imposition-grid-cli/JsonContext.cs`

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using Imposition.Core.Models;

namespace Imposition.GridCli;

[JsonSourceGenerationOptions(WriteIndented = true, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ImpositionResult))]
[JsonSerializable(typeof(DuplexPlan))]
[JsonSerializable(typeof(ErrorResponse))]
internal sealed partial class JsonContext : JsonSerializerContext;

internal sealed record ErrorResponse(ErrorPayload Error);

internal sealed record ErrorPayload(string Code, string Message);
```

- Reutiliza a mesma `CamelCase` + `WriteIndented` de `JsonOpts` (regra de NAMING) → nomes de campos JSON preservados.
- Tipos públicos da CLI: `ImpositionResult` e `DuplexPlan` (contratos do core, **intocados**).
- `ErrorResponse`/`ErrorPayload` são internos novos, sem impacto no domain público — não alteram nenhum resultado de sucesso.

## 2. `packages/imposition-grid-cli/Program.cs`

- Linha 8: `using Imposition.GridCli;` adicionado.
- Linha 35 (duplex): `JsonSerializer.Serialize(plan, JsonContext.Default.DuplexPlan)`.
- Linha 41 (unitário): `JsonSerializer.Serialize(result, JsonContext.Default.ImpositionResult)`.
- 3 blocos `catch` (linhas 46–60): `var err = new ErrorResponse(new ErrorPayload(...))` + `JsonContext.Default.ErrorResponse`; exit codes **2/1/3 intactos**.
- Removida a `static partial class Program` com `JsonOpts` (fim do arquivo).
- `JsonDocument.Parse` (linha 25) mantido; nenhum `#pragma warning disable` adicionado.

## 3. Build

```
> dotnet build -c Release (packages/imposition-grid-cli)
Compilação com êxito. 0 Aviso(s) 0 Erro(s)
→ bin\Release\net10.0\win-x64\imposition-grid.dll
```

- Antes: 10 avisos `IL2026` + `IL3050`; agora **0**.
- `PackageReference` e configs AOT do csproj **não foram tocados**.

## 4. Testes

```
> dotnet test -c Release (packages/imposition-core)
Aprovado: 25/25  (0 falhas, 0 ignorados)
```

## 5. Smoke — prova antes/depois (saída CLI idêntica)

A versão "antes" (serializador reflection, `git HEAD`) foi recompilada em projeto temporário (`C:\Users\IMPRES~1\AppData\Local\Temp\opencode\gridcli-before`) e comparada byte-a-byte (SHA-256) com o CLI source-gen atual, usando os mesmos inputs golden e redirecionamento cru via `cmd`:

| Caso | exit before/after | bytes before / after | Hash |
|---|---|---|---|
| `000-canonical` | 0 / 0 | 185070 / 185070 | **IGUAIS** |
| `001-duplex-headToHead` | 0 / 0 | 410942 / 410942 | **IGUAIS** |
| `002-duplex-headToFoot` | 0 / 0 | 410942 / 410942 | **IGUAIS** |

> **Nota:** os `expected.json` dos goldens são referências abreviadas (subset de campos), não snapshots do stdout do CLI — por isso a prova correta é a comparação byte-a-byte acima, não a comparação direta contra o golden.

## 6. Declaração

Não foram alterados o `imposition-core` nem os contratos públicos — apenas o `imposition-grid-cli` (Program.cs + novo JsonContext.cs). Resultados, exit codes (0/1/2/3) e nomes de campos JSON são exatamente iguais aos anteriores; a mudança é exclusivamente de estratégia de serialização (source-gen).