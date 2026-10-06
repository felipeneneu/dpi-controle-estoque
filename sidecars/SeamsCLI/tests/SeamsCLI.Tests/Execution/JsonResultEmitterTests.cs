using System;
using System.Text.Json;
using FluentAssertions;
using SeamsCLI.Execution;
using Xunit;

namespace SeamsCLI.Tests.Execution;

public class JsonResultEmitterTests
{
    [Fact]
    public void Emit_SuccessResult_ProducesSingleLineJsonWithAllExpectedFields()
    {
        var result = new SeamsWorkflowResult(
            Success: true,
            PanelCount: 3,
            GeneratedFiles: ["C:\\out\\painel_01.jpg", "C:\\out\\painel_02.jpg", "C:\\out\\painel_03.jpg"],
            TotalLinearLengthMeters: 4.56,
            ElapsedTime: TimeSpan.FromMilliseconds(340),
            Warnings: ["Aviso teste"],
            ErrorCode: null,
            ErrorMessage: null);

        var json = JsonResultEmitter.Emit(result);

        json.Should().NotContain("\n");
        json.Should().NotContain("\r");

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("schemaVersion").GetString().Should().Be("1.0");
        root.GetProperty("success").GetBoolean().Should().BeTrue();
        root.GetProperty("panelCount").GetInt32().Should().Be(3);
        root.GetProperty("generatedFiles").GetArrayLength().Should().Be(3);
        root.GetProperty("totalLinearLengthMeters").GetDouble().Should().Be(4.56);
        root.GetProperty("elapsedMs").GetInt64().Should().Be(340);
        root.GetProperty("warnings").GetArrayLength().Should().Be(1);
        root.GetProperty("errorCode").ValueKind.Should().Be(JsonValueKind.Null);
        root.GetProperty("errorMessage").ValueKind.Should().Be(JsonValueKind.Null);
    }

    [Fact]
    public void Emit_ErrorResult_ProducesJsonWithErrorCodesAndEmptyFiles()
    {
        var result = new SeamsWorkflowResult(
            Success: false,
            PanelCount: 0,
            GeneratedFiles: [],
            TotalLinearLengthMeters: 0.0,
            ElapsedTime: TimeSpan.FromMilliseconds(15),
            Warnings: [],
            ErrorCode: "E_EXPORT_SOURCE_NOT_CMYK",
            ErrorMessage: "Arquivo de origem não é CMYK.");

        var json = JsonResultEmitter.Emit(result);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("schemaVersion").GetString().Should().Be("1.0");
        root.GetProperty("success").GetBoolean().Should().BeFalse();
        root.GetProperty("panelCount").GetInt32().Should().Be(0);
        root.GetProperty("generatedFiles").GetArrayLength().Should().Be(0);
        root.GetProperty("warnings").GetArrayLength().Should().Be(0);
        root.GetProperty("errorCode").GetString().Should().Be("E_EXPORT_SOURCE_NOT_CMYK");
        root.GetProperty("errorMessage").GetString().Should().Contain("não é CMYK");
    }

    [Fact]
    public void Emit_PartialFailure_ProducesJsonWithPartialFilesAndError()
    {
        var result = new SeamsWorkflowResult(
            Success: false,
            PanelCount: 1,
            GeneratedFiles: ["C:\\out\\painel_01.jpg"],
            TotalLinearLengthMeters: 1.5,
            ElapsedTime: TimeSpan.FromMilliseconds(200),
            Warnings: [],
            ErrorCode: "E_IO_ERROR",
            ErrorMessage: "Falha de disco ao gravar painel 2.");

        var json = JsonResultEmitter.Emit(result);

        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        root.GetProperty("success").GetBoolean().Should().BeFalse();
        root.GetProperty("errorCode").GetString().Should().Be("E_IO_ERROR");
        root.GetProperty("generatedFiles").GetArrayLength().Should().Be(1);
    }
}
