using System.Runtime.InteropServices;

namespace GraficaOS.Engine;

/// <summary>Interface COM IDispatch para comunicação ExtendScript → .NET.</summary>
[ComVisible(true)]
[Guid("B2C3D4E5-F6A7-8901-BCDE-F12345678901")]
[InterfaceType(ComInterfaceType.InterfaceIsDual)]
public interface IGraficaOSEngine
{
    /// <summary>Retorna a versão do motor (ex: "0.1.0").</summary>
    string GetVersion();

    /// <summary>Retorna JSON com informações do tenant ativo.</summary>
    string GetActiveTenant();

    /// <summary>Calcula o plano de imposição sem gerar PDF.</summary>
    string PlanImposition(string jsonRequest);

    /// <summary>Calcula e gera o PDF imposto.</summary>
    string ImposeToPdf(string jsonRequest);

    /// <summary>Calcula plano para aplicar no documento ativo do Illustrator.</summary>
    string ApplyPlanToDocument(string jsonRequest);

    /// <summary>Retorna opções recalculadas para overflow de grade.</summary>
    string GetOverflowOptions(string jsonRequest);

    /// <summary>Registra evento de telemetria no outbox local.</summary>
    void TrackEvent(string jsonEvent);

    /// <summary>Envia telemetria pendente para o endpoint configurado.</summary>
    string FlushTelemetry();
}
