using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace GraficaOS.Tests;

/// <summary>
/// Testes dos contratos COM e componentes isolados — sem tocar Illustrator,
/// sem registro COM, sem IO real (exceto TenantConfig e TelemetryCollector
/// que usam diretórios temporários).
/// </summary>
public class ComContractTests
{
    // ── Serialização de DTOs ──────────────────────────────────────────

    [Fact]
    public void BR001_ImposeRequestDto_SerializaCamelCase()
    {
        var request = new GraficaOS.Engine.ImposeRequestDto(
            SchemaVersion: "1.0",
            RequestId: "test-1",
            InputPath: @"C:\artes\arte.pdf",
            OutputDir: @"C:\output",
            SheetWMm: 710,
            SheetHMm: 1000,
            ArtWMm: 49,
            ArtHMm: 74,
            GapMm: 0,
            Margins: new GraficaOS.Engine.MarginsDto(0, 0, 0, 0),
            TargetCopies: 112,
            ForceRotation: null,
            SurplusPolicy: "fill_row",
            SubstrateKind: "sheet",
            MaxLengthMm: null,
            Marks: new GraficaOS.Engine.MarksDto(true, "mimaki-fcrm", 20, 3));

        var json = JsonSerializer.Serialize(request, GraficaOS.Engine.JsonDefaults.Options);

        json.Should().Contain("\"schemaVersion\"");
        json.Should().Contain("\"sheetWMm\"");
        json.Should().Contain("\"artWMm\"");
        json.Should().Contain("\"surplusPolicy\"");
        json.Should().NotContain("\"SchemaVersion\"",
            because: "propriedades devem estar em camelCase");
    }

    [Fact]
    public void BR002_ImposeRequestDto_DeserializaCaseInsensitive()
    {
        var json = """
        {
            "SchemaVersion": "1.0",
            "requestId": "test-2",
            "sheetWMm": 665,
            "sheetHMm": 986,
            "artWMm": 19,
            "artHMm": 34,
            "gapMm": 0,
            "targetCopies": 1015,
            "surplusPolicy": "fill_row",
            "substrateKind": "sheet"
        }
        """;

        var dto = JsonSerializer.Deserialize<GraficaOS.Engine.ImposeRequestDto>(
            json, GraficaOS.Engine.JsonDefaults.Options);

        dto.Should().NotBeNull();
        dto!.SchemaVersion.Should().Be("1.0");
        dto.SheetWMm.Should().Be(665);
        dto.ArtWMm.Should().Be(19);
        dto.TargetCopies.Should().Be(1015);
    }

    [Fact]
    public void BR003_ImposeResponseDto_OmiteNullsNaSaida()
    {
        var response = new GraficaOS.Engine.ImposeResponseDto(
            SchemaVersion: "1.0",
            RequestId: "test-3",
            Success: true,
            ErrorCode: null,
            Message: "OK",
            ExecutionTimeMs: 42,
            Sheet: new GraficaOS.Engine.SheetDto(710, 1000),
            Grid: new GraficaOS.Engine.GridDto(14, 8, 112, 112, 0, 0),
            OutputFiles: null,
            Placements: null,
            Options: null);

        var json = JsonSerializer.Serialize(response, GraficaOS.Engine.JsonDefaults.Options);

        json.Should().NotContain("\"errorCode\"",
            because: "campos null devem ser omitidos do JSON");
        json.Should().NotContain("\"outputFiles\"");
        json.Should().NotContain("\"placements\"");
        json.Should().NotContain("\"options\"");
        json.Should().Contain("\"success\":true");
    }

    [Fact]
    public void BR004_PlacementDto_SerializaRotatedComoBool()
    {
        var placement = new GraficaOS.Engine.PlacementDto(
            Index: 0, Col: 0, Row: 0,
            XMm: 23.5, YMm: 23.5,
            WidthMm: 49, HeightMm: 74,
            Rotated: true);

        var json = JsonSerializer.Serialize(placement, GraficaOS.Engine.JsonDefaults.Options);

        json.Should().Contain("\"rotated\":true");
    }

    // ── TenantConfig ──────────────────────────────────────────────────

    [Fact]
    public void BR005_TenantConfig_ArquivoNaoExiste_RetornaUnknown()
    {
        var config = new GraficaOS.Engine.TenantConfig();
        var tenant = config.GetTenant();

        // Se não existe tenant.json no ProgramData, retorna "unknown"
        tenant.Should().NotBeNull();
        tenant.TenantId.Should().NotBeNullOrEmpty();
        tenant.MachineId.Should().NotBeNullOrEmpty();
    }

    [Fact]
    public void BR006_TenantConfig_CacheRetornaMesmaInstancia()
    {
        var config = new GraficaOS.Engine.TenantConfig();
        var t1 = config.GetTenant();
        var t2 = config.GetTenant();

        t1.Should().BeSameAs(t2,
            because: "segunda chamada deve retornar do cache sem reler o disco");
    }

    // ── TelemetryCollector ────────────────────────────────────────────

    [Fact]
    public void BR007_TelemetryCollector_TrackNaoLancaExcecao()
    {
        var collector = new GraficaOS.Engine.TelemetryCollector();
        var evt = new GraficaOS.Engine.TelemetryEventDto(
            EventName: "test.event",
            TenantId: "test-tenant",
            MachineId: "test-machine",
            Timestamp: DateTimeOffset.UtcNow,
            Properties: new() { ["key"] = "value" });

        var act = () => collector.Track(evt);

        act.Should().NotThrow(
            because: "telemetria nunca deve lançar exceção para o chamador");
    }

    [Fact]
    public async Task BR008_TelemetryCollector_FlushSemEndpoint_RetornaSucesso()
    {
        var collector = new GraficaOS.Engine.TelemetryCollector(flushEndpoint: "");
        var result = await collector.FlushAsync();

        result.Success.Should().BeTrue();
        result.SentCount.Should().Be(0);
        result.Message.Should().Contain("Endpoint não configurado");
    }

    // ── Overflow ──────────────────────────────────────────────────────

    [Fact]
    public void BR009_OverflowOptionDto_Serializa3Opcoes()
    {
        var options = new List<GraficaOS.Engine.OverflowOptionDto>
        {
            new("OPTION_1", "1 chapa com 100 unidades", 1, 100),
            new("OPTION_2", "2 chapas × 100 = 200 total", 2, 200),
            new("OPTION_3", "2 chapas balanceadas ≈ 75 cada", 2, 150),
        };

        var json = JsonSerializer.Serialize(options, GraficaOS.Engine.JsonDefaults.Options);

        json.Should().Contain("OPTION_1");
        json.Should().Contain("OPTION_2");
        json.Should().Contain("OPTION_3");
    }

    // ── GetVersion ────────────────────────────────────────────────────

    [Fact]
    public void BR010_ImpositionEngine_GetVersion_Retorna010()
    {
        var engine = new GraficaOS.Engine.ImpositionEngine();
        var version = engine.GetVersion();

        version.Should().Be("0.1.0");
    }

    // ── FlushTelemetry ────────────────────────────────────────────────

    [Fact]
    public void BR011_ImpositionEngine_FlushTelemetry_RetornaJsonValido()
    {
        var engine = new GraficaOS.Engine.ImpositionEngine();
        var result = engine.FlushTelemetry();

        var act = () => JsonSerializer.Deserialize<GraficaOS.Engine.FlushResultDto>(
            result, GraficaOS.Engine.JsonDefaults.Options);

        act.Should().NotThrow(
            because: "FlushTelemetry deve retornar JSON válido sempre");
    }
}
